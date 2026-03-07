use super::logs::append_server_log;
use super::protocol::{
    JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, McpMessage, RequestId,
};
use crate::core::mcp::{McpError, McpResult};
use async_trait::async_trait;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};

/// Maximum age for pending requests before they are considered stale (5 minutes)
const MAX_REQUEST_AGE_SECS: u64 = 300;

/// Interval for cleaning up stale pending requests
const CLEANUP_INTERVAL_SECS: u64 = 60;

/// Default timeout for HTTP requests (30 seconds)
const HTTP_REQUEST_TIMEOUT_SECS: u64 = 30;

/// Default timeout for stdio JSON-RPC request/response round-trips
const STDIO_REQUEST_TIMEOUT_SECS: u64 = 120;

/// SSE reconnection delay in milliseconds
const SSE_RECONNECT_DELAY_MS: u64 = 1000;

/// Maximum SSE reconnection attempts
const SSE_MAX_RECONNECT_ATTEMPTS: u32 = 5;

/// Trait defining the interface for MCP transports
#[async_trait]
pub trait McpTransport: Send + Sync {
    /// Send a JSON-RPC request and wait for a response
    async fn send_request(
        &self,
        method: String,
        params: Option<serde_json::Value>,
    ) -> McpResult<JsonRpcResponse>;

    /// Send a JSON-RPC notification (no response expected)
    fn send_notification(&self, method: String, params: Option<serde_json::Value>);

    /// Check if the transport connection is alive
    fn is_alive(&self) -> bool;

    /// Shutdown the transport connection
    async fn shutdown(&self) -> McpResult<()>;
}

/// Holds a pending request with its creation timestamp for age-based cleanup
struct PendingRequest {
    sender: oneshot::Sender<McpResult<JsonRpcResponse>>,
    created_at: Instant,
}

// ============================================================================
// STDIO Transport Implementation
// ============================================================================

pub struct StdioTransport {
    child: Arc<Mutex<Option<Child>>>,

    request_id: Arc<AtomicU64>,

    pending: Arc<Mutex<HashMap<RequestId, PendingRequest>>>,

    tx: mpsc::UnboundedSender<McpMessage>,

    shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,

    /// Shared flag to signal shutdown to all tasks
    is_shutdown: Arc<AtomicBool>,
}

impl Drop for StdioTransport {
    fn drop(&mut self) {
        // Ensure child process is killed on drop to prevent zombie processes.
        // This handles the case where the transport is dropped due to a panic or
        // unexpected shutdown without calling shutdown() first.
        if let Some(ref mut child) = *self.child.lock() {
            if let Err(e) = child.start_kill() {
                tracing::warn!(
                    "[MCP Stdio Transport] Failed to kill child process on drop: {}",
                    e
                );
            }
        }
        self.is_shutdown.store(true, Ordering::SeqCst);
    }
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
        let programfiles_x86 =
            std::env::var("ProgramFiles(x86)").unwrap_or_default();
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
                        if std::path::Path::new(&bin).is_dir()
                            && !dirs.iter().any(|d| d == &bin)
                        {
                            dirs.push(bin);
                        }
                    }
                }
            }
        }

        // Include nvm directories dynamically.
        // Honour $NVM_DIR if set; otherwise fall back to the conventional ~/.nvm location.
        let home = std::env::var("HOME").unwrap_or_default();
        let nvm_base = std::env::var("NVM_DIR")
            .unwrap_or_else(|_| format!("{}/.nvm", home));
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
        if bytes.len() >= 3
            && bytes[1] == b':'
            && (bytes[2] == b'\\' || bytes[2] == b'/')
        {
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
    // Already an absolute path — use as-is.
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
            let candidate = std::path::Path::new(dir)
                .join(format!("{}{}", command, ext));
            if candidate.is_file() {
                let candidate_str = candidate.to_string_lossy().into_owned();
                tracing::debug!("[MCP Transport] Resolved '{}' -> '{}'", command, candidate_str);
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

impl StdioTransport {
    pub async fn new(
        server_name: String,
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> McpResult<Self> {
        let resolved = resolve_command_path(command);
        tracing::info!(
            "[MCP Transport] Starting server '{}': {} {:?}",
            server_name,
            resolved,
            args
        );

        // Build augmented PATH using the shared helper, then merge any user-supplied
        // PATH from `env` so it is appended rather than silently replacing ours.
        // Use the platform-appropriate PATH separator (`;` on Windows, `:` elsewhere).
        let augmented_path = build_augmented_path();
        let final_path = if let Some(user_path) = env.get("PATH") {
            format!("{}{}{}", augmented_path, path_separator(), user_path)
        } else {
            augmented_path
        };

        let mut cmd = Command::new(&resolved);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .envs(env)
            .env("PATH", &final_path);

        let mut child = cmd
            .spawn()
            .map_err(|e| McpError::ConnectionError(format!("Failed to spawn process: {}", e)))?;

        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| McpError::ConnectionError("Failed to get stdin handle".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| McpError::ConnectionError("Failed to get stdout handle".to_string()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| McpError::ConnectionError("Failed to get stderr handle".to_string()))?;

        let (tx, mut rx) = mpsc::unbounded_channel::<McpMessage>();
        let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();

        let pending: Arc<Mutex<HashMap<RequestId, PendingRequest>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let child_arc = Arc::new(Mutex::new(Some(child)));
        let is_shutdown = Arc::new(AtomicBool::new(false));

        // Writer task
        let pending_write = pending.clone();
        let is_shutdown_write = is_shutdown.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(msg) = rx.recv() => {
                        // Extract request ID only for Request variants (for error tracking)
                        let request_id = match &msg {
                            McpMessage::Request(req) => Some(req.id.clone()),
                            _ => None,
                        };
                        match msg.to_string() {
                            Ok(json) => {
                                let line = format!("{}\n", json);
                                if let Err(e) = stdin.write_all(line.as_bytes()).await {
                                    tracing::error!("[MCP Transport] Failed to write to stdin: {}", e);

                                    // Notify the specific request about the failure
                                    let mut pending = pending_write.lock();
                                    if let Some(id) = request_id {
                                        if let Some(pending_req) = pending.remove(&id) {
                                            let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                                                format!("Failed to write request: {}", e)
                                            )));
                                        }
                                    }

                                    // Notify all remaining pending requests about the connection failure
                                    tracing::warn!("[MCP Transport] Notifying {} pending requests of connection failure", pending.len());
                                    for (_, pending_req) in pending.drain() {
                                        let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                                            "Transport connection lost".to_string()
                                        )));
                                    }

                                    is_shutdown_write.store(true, Ordering::SeqCst);
                                    break;
                                }
                                if let Err(e) = stdin.flush().await {
                                    tracing::error!("[MCP Transport] Failed to flush stdin: {}", e);
                                }
                            }
                            Err(e) => {
                                tracing::error!("[MCP Transport] Failed to serialize message: {}", e);
                            }
                        }
                    }
                    _ = &mut shutdown_rx => {
                        tracing::info!("[MCP Transport] Shutdown signal received");
                        is_shutdown_write.store(true, Ordering::SeqCst);

                        // Clean up any remaining pending requests
                        let mut pending = pending_write.lock();
                        for (_, pending_req) in pending.drain() {
                            let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                                "Transport shutting down".to_string()
                            )));
                        }
                        break;
                    }
                }
            }
        });

        // Reader task (stdout: protocol + potential stray logs)
        let pending_read = pending.clone();
        let is_shutdown_read = is_shutdown.clone();
        let server_name_for_stdout = server_name.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() {
                    continue;
                }

                tracing::debug!("[MCP Transport] Received: {}", line);

                match McpMessage::from_str(&line) {
                    Ok(McpMessage::Response(response)) => {
                        let mut pending = pending_read.lock();
                        if let Some(pending_req) = pending.remove(&response.id) {
                            let _ = pending_req.sender.send(Ok(response));
                        } else {
                            tracing::warn!(
                                "[MCP Transport] Received response for unknown request: {:?}",
                                response.id
                            );
                        }
                    }
                    Ok(McpMessage::Error(error)) => {
                        let mut pending = pending_read.lock();
                        if let Some(pending_req) = pending.remove(&error.id) {
                            let _ = pending_req
                                .sender
                                .send(Err(McpError::RmcpError(error.error.message)));
                        } else {
                            tracing::warn!(
                                "[MCP Transport] Received error for unknown request: {:?}",
                                error.id
                            );
                        }
                    }
                    Ok(McpMessage::Notification(notif)) => {
                        tracing::info!("[MCP Transport] Received notification: {}", notif.method);
                    }
                    Ok(McpMessage::Request(_)) => {
                        tracing::warn!("[MCP Transport] Received request from server (not supported in client mode)");
                    }
                    Err(e) => {
                        tracing::error!("[MCP Transport] Failed to parse message: {}", e);
                        append_server_log(&server_name_for_stdout, format!("[stdout] {}", line));
                    }
                }
            }

            tracing::info!("[MCP Transport] stdout reader finished");

            // Signal shutdown and clean up pending requests when reader exits
            is_shutdown_read.store(true, Ordering::SeqCst);
            let mut pending = pending_read.lock();
            if !pending.is_empty() {
                tracing::warn!(
                    "[MCP Transport] Reader exited, notifying {} pending requests",
                    pending.len()
                );
                for (_, pending_req) in pending.drain() {
                    let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                        "Transport reader disconnected".to_string(),
                    )));
                }
            }
        });

        // Stderr reader task (server logs)
        let server_name_for_stderr = server_name.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                tracing::debug!("[MCP Server stderr] {}", line);
                append_server_log(&server_name_for_stderr, format!("[stderr] {}", line));
            }
        });

        // Periodic cleanup task for stale pending requests
        let pending_cleanup = pending.clone();
        let is_shutdown_cleanup = is_shutdown.clone();
        tokio::spawn(async move {
            let mut interval =
                tokio::time::interval(tokio::time::Duration::from_secs(CLEANUP_INTERVAL_SECS));
            loop {
                interval.tick().await;

                if is_shutdown_cleanup.load(Ordering::SeqCst) {
                    tracing::debug!("[MCP Transport] Cleanup task stopping due to shutdown");
                    break;
                }

                let mut pending = pending_cleanup.lock();
                let now = Instant::now();
                let stale_keys: Vec<RequestId> = pending
                    .iter()
                    .filter(|(_, req)| {
                        now.duration_since(req.created_at).as_secs() > MAX_REQUEST_AGE_SECS
                    })
                    .map(|(id, _)| id.clone())
                    .collect();

                for key in stale_keys {
                    if let Some(pending_req) = pending.remove(&key) {
                        tracing::warn!("[MCP Transport] Cleaning up stale request: {:?}", key);
                        let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                            "Request expired due to age".to_string(),
                        )));
                    }
                }
            }
        });

        Ok(Self {
            child: child_arc,
            request_id: Arc::new(AtomicU64::new(1)),
            pending,
            tx,
            shutdown_tx: Mutex::new(Some(shutdown_tx)),
            is_shutdown,
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
        tracing::debug!("[MCP Transport] send_request called: method={}", method);

        // Check if transport is shutdown
        if self.is_shutdown.load(Ordering::SeqCst) {
            tracing::error!(
                "[MCP Transport] Transport is shutdown, rejecting request: {}",
                method
            );
            return Err(McpError::ConnectionError(
                "Transport is shutdown".to_string(),
            ));
        }

        // Generate a unique request ID with collision detection
        let id = loop {
            let next_id = self.request_id.fetch_add(1, Ordering::SeqCst);
            // Handle potential wrap-around at u64::MAX
            let candidate = RequestId::Number((next_id % i64::MAX as u64) as i64);
            let pending = self.pending.lock();
            if !pending.contains_key(&candidate) {
                break candidate;
            }
            // If collision detected, try next ID
            tracing::debug!("[MCP Transport] Request ID collision detected, trying next ID");
        };

        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method,
            params,
            id: id.clone(),
        };

        let (response_tx, response_rx) = oneshot::channel();

        {
            let mut pending = self.pending.lock();
            pending.insert(
                id.clone(),
                PendingRequest {
                    sender: response_tx,
                    created_at: Instant::now(),
                },
            );
        }

        self.tx.send(McpMessage::Request(request)).map_err(|_| {
            // Clean up pending request if send fails
            self.pending.lock().remove(&id);
            McpError::ConnectionError("Failed to send request: channel closed".to_string())
        })?;

        match tokio::time::timeout(
            tokio::time::Duration::from_secs(STDIO_REQUEST_TIMEOUT_SECS),
            response_rx,
        )
        .await
        {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => {
                self.pending.lock().remove(&id);
                Err(McpError::ConnectionError(
                    "Response channel closed".to_string(),
                ))
            }
            Err(_) => {
                // Remove timed out request and return error
                self.pending.lock().remove(&id);
                Err(McpError::ConnectionError(format!(
                    "Request timeout after {} seconds",
                    STDIO_REQUEST_TIMEOUT_SECS
                )))
            }
        }
    }

    fn send_notification(&self, method: String, params: Option<serde_json::Value>) {
        // BUG 1 FIX: Use JsonRpcNotification (no id field) per JSON-RPC 2.0 spec.
        // Notifications MUST NOT include an id member. Previously this incorrectly
        // created a JsonRpcRequest with id: RequestId::Null which serializes to
        // {"id": null, ...}, causing MCP servers to reject the notification.
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method,
            params,
        };

        let _ = self.tx.send(McpMessage::Notification(notification));
    }

    fn is_alive(&self) -> bool {
        if self.is_shutdown.load(Ordering::SeqCst) {
            return false;
        }
        let mut child = self.child.lock();
        let Some(process) = child.as_mut() else {
            return false;
        };

        match process.try_wait() {
            Ok(Some(status)) => {
                tracing::warn!(
                    "[MCP Transport] Child process exited while checking health: {}",
                    status
                );
                self.is_shutdown.store(true, Ordering::SeqCst);
                child.take();
                false
            }
            Ok(None) => true,
            Err(e) => {
                tracing::warn!("[MCP Transport] Failed to poll child process health: {}", e);
                false
            }
        }
    }

    async fn shutdown(&self) -> McpResult<()> {
        tracing::info!("[MCP Transport] Shutting down");
        self.is_shutdown.store(true, Ordering::SeqCst);

        if let Some(tx) = self.shutdown_tx.lock().take() {
            let _ = tx.send(());
        }

        {
            let mut pending = self.pending.lock();
            if !pending.is_empty() {
                tracing::warn!(
                    "[MCP Transport] Shutdown draining {} pending requests",
                    pending.len()
                );
            }
            for (_, pending_req) in pending.drain() {
                let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                    "Transport shutting down".to_string(),
                )));
            }
        }

        let child = {
            let mut guard = self.child.lock();
            guard.take()
        };
        if let Some(mut c) = child {
            match c.kill().await {
                Ok(_) => {
                    tracing::info!("[MCP Transport] Process killed");
                }
                Err(e) => {
                    tracing::warn!("[MCP Transport] Failed to kill process: {}", e);
                }
            }
        }

        Ok(())
    }
}

// ============================================================================
// HTTP/SSE Transport Implementation
// ============================================================================

/// Configuration for HTTP/SSE transport
#[derive(Debug, Clone)]
pub struct HttpSseConfig {
    /// Base URL of the MCP server (e.g., "http://localhost:8080")
    pub url: String,

    /// Optional API key for authentication
    pub api_key: Option<String>,

    /// Optional bearer token for authentication
    pub bearer_token: Option<String>,

    /// Custom headers to include in requests
    pub headers: HashMap<String, String>,

    /// Request timeout in seconds
    pub timeout_secs: u64,

    /// Whether to verify SSL certificates
    pub verify_ssl: bool,
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
        }
    }
}

/// HTTP/SSE transport for remote MCP servers
///
/// This transport uses:
/// - HTTP POST for client-to-server requests (JSON-RPC)
/// - Server-Sent Events (SSE) for server-to-client streaming responses
///
/// The MCP spec defines that:
/// - Requests are sent via POST to the server's endpoint
/// - The server can respond with either a direct JSON response or initiate an SSE stream
/// - SSE is used for long-running operations and server-initiated notifications
pub struct HttpSseTransport {
    /// Server name for logging
    server_name: String,

    /// HTTP client for making requests
    client: reqwest::Client,

    /// Configuration for the transport
    config: HttpSseConfig,

    /// Request ID counter
    request_id: Arc<AtomicU64>,

    /// Pending requests waiting for responses
    pending: Arc<Mutex<HashMap<RequestId, PendingRequest>>>,

    /// Channel for sending SSE events to be processed
    sse_tx: mpsc::UnboundedSender<SseEvent>,

    /// Shutdown signal sender
    shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,

    /// Shared flag to signal shutdown to all tasks
    is_shutdown: Arc<AtomicBool>,

    /// SSE connection state
    sse_connected: Arc<AtomicBool>,
}

/// Server-Sent Event parsed from the stream
#[derive(Debug, Clone)]
struct SseEvent {
    /// Event type (optional, defaults to "message")
    event: Option<String>,

    /// Event data
    data: String,

    /// Event ID (optional, for resuming)
    id: Option<String>,
}

impl HttpSseTransport {
    /// Create a new HTTP/SSE transport
    pub async fn new(server_name: String, config: HttpSseConfig) -> McpResult<Self> {
        tracing::info!(
            "[MCP HTTP Transport] Connecting to server '{}' at {}",
            server_name,
            config.url
        );

        // Build HTTP client with appropriate settings
        let mut client_builder = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(config.timeout_secs))
            .connect_timeout(std::time::Duration::from_secs(10));

        if !config.verify_ssl {
            // SECURITY: Only allow disabling SSL verification for localhost connections.
            // Disabling for remote servers exposes the connection to MITM attacks.
            let is_localhost = if let Ok(parsed) = url::Url::parse(&config.url) {
                matches!(
                    parsed.host_str(),
                    Some("localhost") | Some("127.0.0.1") | Some("::1")
                )
            } else {
                false
            };

            if !is_localhost {
                tracing::error!(
                    "[MCP HTTP Transport] Refusing to disable SSL verification for remote server '{}' at {}. \
                     SSL verification can only be disabled for localhost connections.",
                    server_name,
                    config.url
                );
                return Err(McpError::ConnectionError(
                    "SSL verification cannot be disabled for remote servers. \
                     Only localhost (127.0.0.1, ::1) connections may bypass SSL verification."
                        .to_string(),
                ));
            }

            tracing::warn!(
                "[MCP HTTP Transport] SSL certificate verification DISABLED for local server '{}'. \
                 This is acceptable for local development with self-signed certificates.",
                server_name
            );
            client_builder = client_builder.danger_accept_invalid_certs(true);
        }

        let client = client_builder.build().map_err(|e| {
            McpError::ConnectionError(format!("Failed to create HTTP client: {}", e))
        })?;

        let (sse_tx, mut sse_rx) = mpsc::unbounded_channel::<SseEvent>();
        let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();

        let pending: Arc<Mutex<HashMap<RequestId, PendingRequest>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let is_shutdown = Arc::new(AtomicBool::new(false));
        let sse_connected = Arc::new(AtomicBool::new(false));

        // SSE event processor task
        let pending_sse = pending.clone();
        let is_shutdown_sse = is_shutdown.clone();
        let server_name_sse = server_name.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(event) = sse_rx.recv() => {
                        Self::process_sse_event(&server_name_sse, &pending_sse, event);
                    }
                    _ = &mut shutdown_rx => {
                        tracing::info!("[MCP HTTP Transport] SSE processor shutdown signal received");
                        is_shutdown_sse.store(true, Ordering::SeqCst);

                        // Clean up pending requests
                        let mut pending = pending_sse.lock();
                        for (_, pending_req) in pending.drain() {
                            let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                                "Transport shutting down".to_string()
                            )));
                        }
                        break;
                    }
                }
            }
        });

        // Periodic cleanup task for stale pending requests
        let pending_cleanup = pending.clone();
        let is_shutdown_cleanup = is_shutdown.clone();
        tokio::spawn(async move {
            let mut interval =
                tokio::time::interval(tokio::time::Duration::from_secs(CLEANUP_INTERVAL_SECS));
            loop {
                interval.tick().await;

                if is_shutdown_cleanup.load(Ordering::SeqCst) {
                    tracing::debug!("[MCP HTTP Transport] Cleanup task stopping due to shutdown");
                    break;
                }

                let mut pending = pending_cleanup.lock();
                let now = Instant::now();
                let stale_keys: Vec<RequestId> = pending
                    .iter()
                    .filter(|(_, req)| {
                        now.duration_since(req.created_at).as_secs() > MAX_REQUEST_AGE_SECS
                    })
                    .map(|(id, _)| id.clone())
                    .collect();

                for key in stale_keys {
                    if let Some(pending_req) = pending.remove(&key) {
                        tracing::warn!("[MCP HTTP Transport] Cleaning up stale request: {:?}", key);
                        let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                            "Request expired due to age".to_string(),
                        )));
                    }
                }
            }
        });

        let transport = Self {
            server_name,
            client,
            config,
            request_id: Arc::new(AtomicU64::new(1)),
            pending,
            sse_tx,
            shutdown_tx: Mutex::new(Some(shutdown_tx)),
            is_shutdown,
            sse_connected,
        };

        Ok(transport)
    }

    /// Start the SSE connection for receiving server-initiated messages
    ///
    /// This should be called after initialization to enable server push capabilities.
    /// The SSE endpoint is typically at `{base_url}/sse` or `{base_url}/events`.
    pub async fn start_sse_listener(&self, sse_endpoint: Option<&str>) -> McpResult<()> {
        let url = match sse_endpoint {
            Some(endpoint) => format!("{}/{}", self.config.url.trim_end_matches('/'), endpoint),
            None => format!("{}/sse", self.config.url.trim_end_matches('/')),
        };

        tracing::info!(
            "[MCP HTTP Transport] Starting SSE listener for '{}' at {}",
            self.server_name,
            url
        );

        let client = self.client.clone();
        let sse_tx = self.sse_tx.clone();
        let is_shutdown = self.is_shutdown.clone();
        let sse_connected = self.sse_connected.clone();
        let server_name = self.server_name.clone();
        let headers = self.build_headers()?;

        tokio::spawn(async move {
            let mut reconnect_attempts = 0;

            while !is_shutdown.load(Ordering::SeqCst)
                && reconnect_attempts < SSE_MAX_RECONNECT_ATTEMPTS
            {
                match Self::connect_sse(&client, &url, &headers).await {
                    Ok(response) => {
                        sse_connected.store(true, Ordering::SeqCst);
                        reconnect_attempts = 0;

                        tracing::info!(
                            "[MCP HTTP Transport] SSE connection established for '{}'",
                            server_name
                        );

                        // Process the SSE stream
                        if let Err(e) =
                            Self::process_sse_stream(&server_name, response, &sse_tx, &is_shutdown)
                                .await
                        {
                            tracing::warn!(
                                "[MCP HTTP Transport] SSE stream error for '{}': {}",
                                server_name,
                                e
                            );
                        }

                        sse_connected.store(false, Ordering::SeqCst);
                    }
                    Err(e) => {
                        tracing::warn!(
                            "[MCP HTTP Transport] SSE connection failed for '{}': {} (attempt {}/{})",
                            server_name,
                            e,
                            reconnect_attempts + 1,
                            SSE_MAX_RECONNECT_ATTEMPTS
                        );
                        reconnect_attempts += 1;
                    }
                }

                // Wait before reconnecting
                if !is_shutdown.load(Ordering::SeqCst)
                    && reconnect_attempts < SSE_MAX_RECONNECT_ATTEMPTS
                {
                    tokio::time::sleep(tokio::time::Duration::from_millis(
                        SSE_RECONNECT_DELAY_MS * reconnect_attempts as u64,
                    ))
                    .await;
                }
            }

            if reconnect_attempts >= SSE_MAX_RECONNECT_ATTEMPTS {
                tracing::error!(
                    "[MCP HTTP Transport] SSE reconnection limit reached for '{}'",
                    server_name
                );
            }
        });

        Ok(())
    }

    /// Connect to SSE endpoint
    async fn connect_sse(
        client: &reqwest::Client,
        url: &str,
        headers: &reqwest::header::HeaderMap,
    ) -> McpResult<reqwest::Response> {
        let response = client
            .get(url)
            .headers(headers.clone())
            .header("Accept", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .send()
            .await
            .map_err(|e| McpError::ConnectionError(format!("SSE connection failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(McpError::ConnectionError(format!(
                "SSE endpoint returned error: {}",
                response.status()
            )));
        }

        Ok(response)
    }

    /// Process the SSE stream
    async fn process_sse_stream(
        server_name: &str,
        response: reqwest::Response,
        sse_tx: &mpsc::UnboundedSender<SseEvent>,
        is_shutdown: &Arc<AtomicBool>,
    ) -> McpResult<()> {
        use futures_util::StreamExt;

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut current_event = SseEvent {
            event: None,
            data: String::new(),
            id: None,
        };

        while let Some(chunk_result) = stream.next().await {
            if is_shutdown.load(Ordering::SeqCst) {
                break;
            }

            let chunk = chunk_result
                .map_err(|e| McpError::ConnectionError(format!("SSE stream error: {}", e)))?;

            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Process complete lines
            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if line.is_empty() {
                    // Empty line signals end of event
                    if !current_event.data.is_empty() {
                        // Remove trailing newline from data
                        if current_event.data.ends_with('\n') {
                            current_event.data.pop();
                        }

                        tracing::debug!(
                            "[MCP HTTP Transport] SSE event for '{}': type={:?}, data_len={}",
                            server_name,
                            current_event.event,
                            current_event.data.len()
                        );

                        if sse_tx.send(current_event.clone()).is_err() {
                            tracing::warn!(
                                "[MCP HTTP Transport] Failed to send SSE event - channel closed"
                            );
                            return Err(McpError::ConnectionError(
                                "SSE event channel closed".to_string(),
                            ));
                        }
                    }

                    // Reset for next event
                    current_event = SseEvent {
                        event: None,
                        data: String::new(),
                        id: None,
                    };
                } else if let Some(value) = line.strip_prefix("event:") {
                    current_event.event = Some(value.trim().to_string());
                } else if let Some(value) = line.strip_prefix("data:") {
                    if !current_event.data.is_empty() {
                        current_event.data.push('\n');
                    }
                    current_event.data.push_str(value.trim_start());
                } else if let Some(value) = line.strip_prefix("id:") {
                    current_event.id = Some(value.trim().to_string());
                } else if line.starts_with(':') {
                    // Comment, ignore
                }
            }
        }

        Ok(())
    }

    /// Process an SSE event
    fn process_sse_event(
        server_name: &str,
        pending: &Arc<Mutex<HashMap<RequestId, PendingRequest>>>,
        event: SseEvent,
    ) {
        // Try to parse the event data as a JSON-RPC message
        match McpMessage::from_str(&event.data) {
            Ok(McpMessage::Response(response)) => {
                let mut pending_lock = pending.lock();
                if let Some(pending_req) = pending_lock.remove(&response.id) {
                    let _ = pending_req.sender.send(Ok(response));
                } else {
                    tracing::warn!(
                        "[MCP HTTP Transport] Received SSE response for unknown request: {:?}",
                        response.id
                    );
                }
            }
            Ok(McpMessage::Error(error)) => {
                let mut pending_lock = pending.lock();
                if let Some(pending_req) = pending_lock.remove(&error.id) {
                    let _ = pending_req
                        .sender
                        .send(Err(McpError::RmcpError(error.error.message)));
                } else {
                    tracing::warn!(
                        "[MCP HTTP Transport] Received SSE error for unknown request: {:?}",
                        error.id
                    );
                }
            }
            Ok(McpMessage::Notification(notif)) => {
                tracing::info!(
                    "[MCP HTTP Transport] Received SSE notification for '{}': {}",
                    server_name,
                    notif.method
                );
                append_server_log(server_name, format!("[sse notification] {}", notif.method));
            }
            Ok(McpMessage::Request(req)) => {
                tracing::warn!(
                    "[MCP HTTP Transport] Received server request via SSE (not supported): {}",
                    req.method
                );
            }
            Err(e) => {
                // Not a JSON-RPC message, log as server message
                tracing::debug!(
                    "[MCP HTTP Transport] Non-JSON SSE event for '{}': {}",
                    server_name,
                    e
                );
                append_server_log(server_name, format!("[sse] {}", event.data));
            }
        }
    }

    /// Build headers for HTTP requests
    fn build_headers(&self) -> McpResult<reqwest::header::HeaderMap> {
        use reqwest::header::{HeaderMap, HeaderName, HeaderValue};

        let mut headers = HeaderMap::new();

        // Add content type
        headers.insert("Content-Type", HeaderValue::from_static("application/json"));

        // Add API key if configured
        if let Some(ref api_key) = self.config.api_key {
            headers.insert(
                "X-API-Key",
                HeaderValue::from_str(api_key).map_err(|e| {
                    McpError::InvalidConfig(format!("Invalid API key header value: {}", e))
                })?,
            );
        }

        // Add bearer token if configured
        if let Some(ref token) = self.config.bearer_token {
            headers.insert(
                "Authorization",
                HeaderValue::from_str(&format!("Bearer {}", token)).map_err(|e| {
                    McpError::InvalidConfig(format!("Invalid bearer token header value: {}", e))
                })?,
            );
        }

        // Add custom headers
        for (key, value) in &self.config.headers {
            let header_name = HeaderName::try_from(key.as_str()).map_err(|e| {
                McpError::InvalidConfig(format!("Invalid header name '{}': {}", key, e))
            })?;
            let header_value = HeaderValue::from_str(value).map_err(|e| {
                McpError::InvalidConfig(format!("Invalid header value for '{}': {}", key, e))
            })?;
            headers.insert(header_name, header_value);
        }

        Ok(headers)
    }

    /// Send HTTP POST request with JSON-RPC payload
    async fn send_http_request(&self, request: &JsonRpcRequest) -> McpResult<JsonRpcResponse> {
        let url = format!("{}/message", self.config.url.trim_end_matches('/'));
        let headers = self.build_headers()?;

        let body = serde_json::to_string(request).map_err(|e| {
            McpError::ConnectionError(format!("Failed to serialize request: {}", e))
        })?;

        tracing::debug!(
            "[MCP HTTP Transport] Sending request to '{}': method={}, id={:?}",
            self.server_name,
            request.method,
            request.id
        );

        let response = self
            .client
            .post(&url)
            .headers(headers)
            .body(body)
            .send()
            .await
            .map_err(|e| McpError::ConnectionError(format!("HTTP request failed: {}", e)))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(McpError::ConnectionError(format!(
                "HTTP request failed with status {}: {}",
                status, error_text
            )));
        }

        // Check content type to determine response format
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        if content_type.contains("text/event-stream") {
            // Server wants to respond via SSE - the response will come through the SSE channel
            // Return a placeholder that will be replaced by the actual response
            Err(McpError::ConnectionError(
                "Response will be delivered via SSE".to_string(),
            ))
        } else {
            // Direct JSON response
            let response_text = response.text().await.map_err(|e| {
                McpError::ConnectionError(format!("Failed to read response body: {}", e))
            })?;

            match McpMessage::from_str(&response_text) {
                Ok(McpMessage::Response(resp)) => Ok(resp),
                Ok(McpMessage::Error(err)) => Err(McpError::RmcpError(err.error.message)),
                _ => Err(McpError::ConnectionError(format!(
                    "Unexpected response format: {}",
                    response_text
                ))),
            }
        }
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

        // Generate a unique request ID
        let id = loop {
            let next_id = self.request_id.fetch_add(1, Ordering::SeqCst);
            let candidate = RequestId::Number((next_id % i64::MAX as u64) as i64);
            let pending = self.pending.lock();
            if !pending.contains_key(&candidate) {
                break candidate;
            }
        };

        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method,
            params,
            id: id.clone(),
        };

        // Try direct HTTP request first
        match self.send_http_request(&request).await {
            Ok(response) => Ok(response),
            Err(McpError::ConnectionError(msg)) if msg.contains("SSE") => {
                // Response will come via SSE, wait for it
                let (response_tx, response_rx) = oneshot::channel();

                {
                    let mut pending = self.pending.lock();
                    pending.insert(
                        id.clone(),
                        PendingRequest {
                            sender: response_tx,
                            created_at: Instant::now(),
                        },
                    );
                }

                match tokio::time::timeout(
                    tokio::time::Duration::from_secs(self.config.timeout_secs),
                    response_rx,
                )
                .await
                {
                    Ok(Ok(result)) => result,
                    Ok(Err(_)) => {
                        self.pending.lock().remove(&id);
                        Err(McpError::ConnectionError(
                            "Response channel closed".to_string(),
                        ))
                    }
                    Err(_) => {
                        self.pending.lock().remove(&id);
                        Err(McpError::ConnectionError(format!(
                            "Request timeout after {} seconds",
                            self.config.timeout_secs
                        )))
                    }
                }
            }
            Err(e) => Err(e),
        }
    }

    fn send_notification(&self, method: String, params: Option<serde_json::Value>) {
        if self.is_shutdown.load(Ordering::SeqCst) {
            return;
        }

        // BUG 1 FIX: Use JsonRpcNotification (no id field) per JSON-RPC 2.0 spec.
        // Notifications MUST NOT include an id member. Previously this incorrectly
        // created a JsonRpcRequest with id: RequestId::Null which serializes to
        // {"id": null, ...}, causing MCP servers to reject the notification.
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: method.clone(),
            params,
        };

        let client = self.client.clone();
        let url = format!("{}/message", self.config.url.trim_end_matches('/'));
        let server_name = self.server_name.clone();

        // Clone headers for async block
        let headers = match self.build_headers() {
            Ok(h) => h,
            Err(e) => {
                tracing::error!(
                    "[MCP HTTP Transport] Failed to build headers for notification: {}",
                    e
                );
                return;
            }
        };

        // Send notification in background (fire and forget)
        tokio::spawn(async move {
            let body = match serde_json::to_string(&notification) {
                Ok(b) => b,
                Err(e) => {
                    tracing::error!(
                        "[MCP HTTP Transport] Failed to serialize notification: {}",
                        e
                    );
                    return;
                }
            };

            if let Err(e) = client.post(&url).headers(headers).body(body).send().await {
                tracing::warn!(
                    "[MCP HTTP Transport] Failed to send notification '{}' to '{}': {}",
                    method,
                    server_name,
                    e
                );
            }
        });
    }

    fn is_alive(&self) -> bool {
        !self.is_shutdown.load(Ordering::SeqCst)
    }

    async fn shutdown(&self) -> McpResult<()> {
        tracing::info!(
            "[MCP HTTP Transport] Shutting down transport for '{}'",
            self.server_name
        );

        self.is_shutdown.store(true, Ordering::SeqCst);
        self.sse_connected.store(false, Ordering::SeqCst);

        if let Some(tx) = self.shutdown_tx.lock().take() {
            let _ = tx.send(());
        }

        {
            let mut pending = self.pending.lock();
            if !pending.is_empty() {
                tracing::warn!(
                    "[MCP HTTP Transport] Shutdown draining {} pending requests for '{}'",
                    pending.len(),
                    self.server_name
                );
            }
            for (_, pending_req) in pending.drain() {
                let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                    "Transport shutting down".to_string(),
                )));
            }
        }

        Ok(())
    }
}

// ============================================================================
// Transport Factory
// ============================================================================

/// Enum representing different transport types
pub enum Transport {
    Stdio(StdioTransport),
    HttpSse(HttpSseTransport),
}

impl Transport {
    /// Create a transport based on configuration
    pub async fn from_config(
        server_name: String,
        config: &super::config::McpServerConfig,
    ) -> McpResult<Self> {
        match &config.transport {
            Some(transport_config) => match transport_config {
                TransportConfig::Stdio => {
                    let transport = StdioTransport::new(
                        server_name,
                        &config.command,
                        &config.args,
                        &config.env,
                    )
                    .await?;
                    Ok(Transport::Stdio(transport))
                }
                TransportConfig::Http(http_config) => {
                    let transport = HttpSseTransport::new(server_name, http_config.clone()).await?;
                    Ok(Transport::HttpSse(transport))
                }
            },
            None => {
                // Default to STDIO for backward compatibility
                let transport =
                    StdioTransport::new(server_name, &config.command, &config.args, &config.env)
                        .await?;
                Ok(Transport::Stdio(transport))
            }
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

    fn send_notification(&self, method: String, params: Option<serde_json::Value>) {
        match self {
            Transport::Stdio(t) => t.send_notification(method, params),
            Transport::HttpSse(t) => t.send_notification(method, params),
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
    Http(HttpSseConfig),
}

// Implement Serialize/Deserialize for HttpSseConfig
impl serde::Serialize for HttpSseConfig {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("HttpSseConfig", 6)?;
        state.serialize_field("url", &self.url)?;
        state.serialize_field("api_key", &self.api_key)?;
        state.serialize_field("bearer_token", &self.bearer_token)?;
        state.serialize_field("headers", &self.headers)?;
        state.serialize_field("timeout_secs", &self.timeout_secs)?;
        state.serialize_field("verify_ssl", &self.verify_ssl)?;
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
        })
    }
}

#[cfg(test)]
mod tests {
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
        let http_config = TransportConfig::Http(HttpSseConfig {
            url: "http://localhost:8080".to_string(),
            ..Default::default()
        });
        let json = serde_json::to_string(&http_config).unwrap();
        assert!(json.contains("http"));
        assert!(json.contains("localhost:8080"));
    }

    #[test]
    fn test_sse_event_parsing() {
        // This tests the SSE event structure
        let event = SseEvent {
            event: Some("message".to_string()),
            data: r#"{"jsonrpc":"2.0","result":{},"id":1}"#.to_string(),
            id: Some("1".to_string()),
        };

        assert_eq!(event.event, Some("message".to_string()));
        assert!(event.data.contains("jsonrpc"));
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
}
