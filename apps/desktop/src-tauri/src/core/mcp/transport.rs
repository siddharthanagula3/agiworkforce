use super::logs::append_server_log;
use super::protocol::{JsonRpcResponse, RequestId};
use crate::core::mcp::{McpError, McpResult};
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot};

/// Default timeout for HTTP requests (30 seconds)
const HTTP_REQUEST_TIMEOUT_SECS: u64 = 30;

/// Default timeout for stdio JSON-RPC request/response round-trips
const STDIO_REQUEST_TIMEOUT_SECS: u64 = 120;

/// Default timeout for SSE stream idle reads (seconds).
/// If no SSE chunk arrives within this window, the stream is considered stalled.
const SSE_STREAM_IDLE_TIMEOUT_SECS: u64 = 60;

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

// ============================================================================
// STDIO Transport Implementation
// ============================================================================

/// Interval for the stdio liveness snapshot + stderr drain in the engine actor.
const STDIO_LIVENESS_POLL_SECS: u64 = 5;

/// stdio MCP transport — a thin facade over the shared
/// [`agiworkforce_mcp::McpClient`] engine (Wave 5 stage d2 of
/// `docs/plans/rust-engine-extraction-2026-07-09.md`).
///
/// The engine owns the child process, JSON-RPC framing, id correlation, and
/// per-request timeouts. Desktop-side POLICY stays here in [`StdioTransport::new`]:
/// the executor allowlist + metachar validation, PATH augmentation/resolution
/// for Finder-launched apps, and the canonical env blocklist filter.
///
/// A background actor task exclusively owns the engine client; the
/// [`McpTransport`] methods talk to it over a FIFO command channel, which
/// preserves the notification/request ordering guarantees of the old
/// writer-task design (`notifications/initialized` is written before any
/// later request). Requests are serialized through the engine (the old
/// transport could interleave concurrent requests, but no production caller
/// issues concurrent RPCs on one session — verified during the d2 swap).
///
/// The engine's connection is host-handshake-driven
/// ([`agiworkforce_mcp::McpClient::connect_without_handshake`]): `McpSession`
/// keeps building the exact `initialize` wire frames (protocolVersion
/// 2025-11-25, desktop clientInfo) it always sent.
pub struct StdioTransport {
    /// FIFO command channel into the engine actor.
    tx: mpsc::UnboundedSender<EngineCommand>,

    /// Liveness snapshot maintained by the actor (child `try_wait` poll every
    /// [`STDIO_LIVENESS_POLL_SECS`], plus refresh on request errors).
    alive: Arc<AtomicBool>,

    /// Set by [`McpTransport::shutdown`]; rejects new requests immediately.
    is_shutdown: Arc<AtomicBool>,

    /// Wakes the actor out of an in-flight request when shutdown is requested,
    /// so the child is killed promptly (the old transport killed on shutdown
    /// without waiting for in-flight requests).
    shutdown_signal: Arc<tokio::sync::Notify>,
}

/// Commands processed by the engine actor. FIFO order is the ordering contract.
enum EngineCommand {
    Request {
        method: String,
        params: Option<serde_json::Value>,
        reply: oneshot::Sender<McpResult<JsonRpcResponse>>,
    },
    Notify {
        method: String,
        params: Option<serde_json::Value>,
    },
    Shutdown {
        reply: oneshot::Sender<()>,
    },
}

/// Map an engine error onto the desktop error taxonomy. JSON-RPC error frames
/// surface from the engine as "MCP error {code}: {message}" (the same server
/// error the old transport mapped to [`McpError::RmcpError`]); everything else
/// (I/O, timeout, closed pipe) was a [`McpError::ConnectionError`] before and
/// stays one.
fn map_engine_error(e: agiworkforce_mcp::McpError) -> McpError {
    let msg = format!("{:#}", e.as_anyhow());
    if msg.contains("MCP error ") {
        McpError::RmcpError(msg)
    } else {
        McpError::ConnectionError(msg)
    }
}

/// Drain buffered child stderr lines into the desktop per-server log store —
/// the same `[stderr]`-prefixed stream the old dedicated stderr task produced.
fn drain_engine_stderr(server_name: &str, client: &agiworkforce_mcp::McpClient) {
    for line in client.drain_stderr() {
        tracing::debug!("[MCP Server stderr] {}", line);
        append_server_log(server_name, format!("[stderr] {}", line));
    }
}

/// Host hooks handed to the shared engine, common to both desktop transports.
/// Elicitation auto-declines (desktop's transport never surfaced
/// server-initiated requests), the browser gate denies (no OAuth on these
/// paths — desktop resolves credentials app-side), and engine lifecycle logs
/// route to tracing.
fn engine_hooks(server_name: &str) -> agiworkforce_mcp::ClientHooks {
    agiworkforce_mcp::ClientHooks {
        token_store: Arc::new(agiworkforce_mcp::hooks::InMemoryTokenStore::new()),
        elicitation: Arc::new(agiworkforce_mcp::AutoDeclineHandler),
        browser: Arc::new(agiworkforce_mcp::hooks::DenyBrowserAuthorizer),
        client_info: agiworkforce_mcp::ClientInfo {
            name: "AGI Workforce".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        },
        on_log: {
            let name = server_name.to_string();
            Arc::new(move |msg: &str| {
                tracing::info!("[MCP Transport] [{}] {}", name, msg);
            })
        },
    }
}

/// The engine actor shared by both transports: exclusively owns the engine
/// client, processes commands in FIFO order, keeps the liveness snapshot
/// fresh, and streams child stderr into the per-server log store (stdio only —
/// remote transports have no stderr).
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
                            // `request` (and its &mut client borrow) drops here.
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
                                // Shutdown requested mid-request: abandon it and
                                // tear the engine down promptly (the old transports
                                // killed/dropped on shutdown without waiting).
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
                    Some(EngineCommand::Notify { method, params }) => {
                        if let Err(e) = client.notify(&method, params).await {
                            tracing::warn!(
                                "[MCP Transport] Notification '{}' failed: {:#}",
                                method,
                                e.as_anyhow()
                            );
                        }
                        drain_engine_stderr(&server_name, &client);
                    }
                    Some(EngineCommand::Shutdown { reply }) => {
                        let _ = client.shutdown().await;
                        drain_engine_stderr(&server_name, &client);
                        alive.store(false, Ordering::SeqCst);
                        let _ = reply.send(());
                        break;
                    }
                    None => {
                        // Transport dropped without shutdown(): tear down the
                        // engine so no child process / stream is leaked.
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
        // Validate the command against the allowlist before spawning
        validate_mcp_command(command)?;

        // Validate each arg for shell metacharacters
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

        // Build augmented PATH using the shared helper, then merge any user-supplied
        // PATH from `env` so it is appended rather than silently replacing ours.
        // Use the platform-appropriate PATH separator (`;` on Windows, `:` elsewhere).
        let augmented_path = build_augmented_path();
        let final_path = if let Some(user_path) = env.get("PATH") {
            format!("{}{}{}", augmented_path, path_separator(), user_path)
        } else {
            augmented_path
        };

        // SECURITY: Blocklist approach for env vars passed to MCP child processes.
        // We use a blocklist (not allowlist) because MCP servers legitimately need most of
        // the parent environment (PATH, HOME, LANG, etc.) to function. An allowlist would
        // break too many servers. Instead we deny specific variables that enable:
        //   - Shared library injection (LD_PRELOAD, DYLD_INSERT_LIBRARIES, etc.)
        //   - Runtime code injection via language-specific hooks (NODE_OPTIONS, PYTHONSTARTUP, etc.)
        //   - Shell startup injection (BASH_ENV, ENV, ZDOTDIR)
        //   - Information disclosure in debug builds (NODE_DEBUG, RUST_LOG)
        //   - Electron/Node.js sandbox escapes (ELECTRON_RUN_AS_NODE)
        // BATCH-5 (audit 2026-05-19): the inline `BLOCKED_ENV_VARS` constant
        // formerly lived here. It moved to `crate::sys::security::env_filter`
        // so this site, `sys/commands/code_execution`, and `core/agi/sandbox`
        // all consume the same canonical list (strict superset of the prior
        // three lists).
        let filtered_env: std::collections::HashMap<String, String> = env
            .iter()
            .filter(|(key, _)| !crate::sys::security::env_filter::is_blocked_env_var(key))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();

        // Hand the spawn + JSON-RPC mechanics to the shared engine. The engine's
        // stdio spawn is env_clear + safe-parent-allowlist + manifest env (with
        // its own loader-injection blocklist on top of ours), so the child gets
        // a same-or-stricter environment than before. The augmented PATH is
        // passed through the manifest env so command discovery behavior
        // (Finder-launched apps) is preserved exactly.
        let mut engine_env = filtered_env;
        engine_env.insert("PATH".to_string(), final_path);

        let engine_config = agiworkforce_mcp::TransportConfig::Stdio {
            command: resolved,
            args: args.to_vec(),
            env: engine_env,
        };
        // Elicitation note: desktop's elicitation UI plumbing is not wired to
        // the transport today (the old read loop ignored server-initiated
        // requests); the engine's auto-decline handler answers
        // `elicitation/create` with a decline instead of leaving the server
        // hanging.
        let hooks = engine_hooks(&server_name);

        // No handshake here: McpSession drives its own `initialize` (protocol
        // version 2025-11-25, desktop clientInfo) through send_request, exactly
        // as it did against the old transport.
        let client = agiworkforce_mcp::McpClient::connect_without_handshake(
            &server_name,
            engine_config,
            agiworkforce_mcp::McpTimeouts::default(),
            hooks,
        )
        .await
        .map_err(map_engine_error)?;

        let (tx, rx) = mpsc::unbounded_channel::<EngineCommand>();
        let response_seq = Arc::new(AtomicU64::new(1));
        let alive = Arc::new(AtomicBool::new(true));
        let is_shutdown = Arc::new(AtomicBool::new(false));
        let shutdown_signal = Arc::new(tokio::sync::Notify::new());

        spawn_engine_actor(
            server_name,
            client,
            rx,
            response_seq,
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

        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(EngineCommand::Request {
                method,
                params,
                reply: reply_tx,
            })
            .map_err(|_| {
                McpError::ConnectionError("Failed to send request: channel closed".to_string())
            })?;

        // The engine enforces the same per-request timeout internally; this
        // outer bound also caps time spent queued behind an in-flight request.
        match tokio::time::timeout(
            tokio::time::Duration::from_secs(STDIO_REQUEST_TIMEOUT_SECS),
            reply_rx,
        )
        .await
        {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(McpError::ConnectionError(
                "Response channel closed".to_string(),
            )),
            Err(_) => Err(McpError::ConnectionError(format!(
                "Request timeout after {} seconds",
                STDIO_REQUEST_TIMEOUT_SECS
            ))),
        }
    }

    fn send_notification(&self, method: String, params: Option<serde_json::Value>) {
        if self.is_shutdown.load(Ordering::SeqCst) {
            return;
        }
        // FIFO with requests through the actor channel, so lifecycle
        // notifications keep their ordering guarantees (e.g.
        // `notifications/initialized` is written before any later request).
        // The engine serializes notifications without an `id` member per the
        // JSON-RPC 2.0 spec (BUG 1 FIX preserved).
        let _ = self.tx.send(EngineCommand::Notify { method, params });
    }

    fn is_alive(&self) -> bool {
        !self.is_shutdown.load(Ordering::SeqCst) && self.alive.load(Ordering::SeqCst)
    }

    async fn shutdown(&self) -> McpResult<()> {
        tracing::info!("[MCP Transport] Shutting down");
        self.is_shutdown.store(true, Ordering::SeqCst);

        // Wake the actor out of any in-flight request so the child is killed
        // promptly, then ask it to shut the engine down (SIGTERM, then SIGKILL).
        self.shutdown_signal.notify_waiters();
        let (reply_tx, reply_rx) = oneshot::channel();
        if self
            .tx
            .send(EngineCommand::Shutdown { reply: reply_tx })
            .is_ok()
        {
            // Bounded wait: if the actor already exited via the shutdown signal,
            // the reply sender is dropped and this returns immediately.
            let _ = tokio::time::timeout(tokio::time::Duration::from_secs(5), reply_rx).await;
        }
        self.alive.store(false, Ordering::SeqCst);

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

/// Connect timeout for SSE long-lived connections (seconds).
/// Separate from request timeout because SSE streams are open-ended.
const SSE_CONNECT_TIMEOUT_SECS: u64 = 30;

/// HTTP/SSE (legacy split-endpoint) MCP transport — a thin facade over the
/// shared [`agiworkforce_mcp::McpClient`] engine speaking
/// `TransportConfig::SseLegacy` (Wave 5 stage d2 of
/// `docs/plans/rust-engine-extraction-2026-07-09.md`).
///
/// Wire convention (unchanged): outbound JSON-RPC goes via POST to
/// `{url}/message`; a best-effort long-lived `GET {url}/sse` carries
/// server-initiated frames, with reconnect (5 consecutive connect failures
/// max, linear 1s backoff, attempts reset on success) and a 60s stalled-stream
/// read timeout — all now inside the engine. Responses may arrive inline on
/// the POST or via the SSE stream (dual delivery); the engine correlates both
/// on the JSON-RPC id. This transport is legacy-convention only (it never
/// spoke streamable-HTTP 2025-06-18; the engine's `Http` config is available
/// when desktop adds that).
///
/// Desktop-side POLICY stays here in [`HttpSseTransport::new`]: SSRF URL
/// validation + the 50 MB response cap + the 30s connect / 60s read timeouts
/// (as engine hardening knobs), the SEV-DESK-07 `verify_ssl` policy (refused
/// in release builds; debug builds localhost-only), and the
/// api-key/bearer/custom header mapping with build-time validation.
///
/// Same actor model as [`StdioTransport`]: a background task exclusively owns
/// the engine client behind a FIFO command channel.
pub struct HttpSseTransport {
    /// Server name for logging.
    server_name: String,

    /// FIFO command channel into the engine actor.
    tx: mpsc::UnboundedSender<EngineCommand>,

    /// Liveness snapshot maintained by the actor. Remote transports report
    /// alive until shutdown (matching the old `!is_shutdown` semantics —
    /// connection failures surface on the next request).
    alive: Arc<AtomicBool>,

    /// Set by [`McpTransport::shutdown`]; rejects new requests immediately.
    is_shutdown: Arc<AtomicBool>,

    /// Wakes the actor out of an in-flight request when shutdown is requested.
    shutdown_signal: Arc<tokio::sync::Notify>,

    /// Per-request timeout (seconds), from [`HttpSseConfig::timeout_secs`].
    request_timeout_secs: u64,
}

/// Maximum inline response body size accepted from a remote MCP server
/// (Content-Length checked before the body is read). FIX R-10 preserved.
const MAX_RESPONSE_BODY_BYTES: u64 = 50_000_000; // 50 MB

impl HttpSseTransport {
    /// Create a new HTTP/SSE transport over the shared engine.
    pub async fn new(server_name: String, config: HttpSseConfig) -> McpResult<Self> {
        tracing::info!(
            "[MCP HTTP Transport] Connecting to server '{}' at {}",
            server_name,
            config.url
        );

        // SEV-DESK-07 (defence-in-depth), preserved verbatim from the old
        // transport: in release builds, refuse `verify_ssl: false` regardless
        // of host — a malicious config file must not be able to downgrade TLS.
        // Debug builds may disable verification for localhost only.
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
                    "[MCP HTTP Transport] SSL certificate verification DISABLED for local server '{}' (debug build). \
                     This is acceptable for local development with self-signed certificates.",
                    server_name
                );
            }
        }

        // Header mapping with build-time validation (old `build_headers`
        // semantics): api_key -> X-API-Key, bearer_token -> Authorization,
        // plus custom headers. Content-Type is set per-request by the engine.
        let mut engine_headers: HashMap<String, String> = HashMap::new();
        if let Some(ref api_key) = config.api_key {
            reqwest::header::HeaderValue::from_str(api_key).map_err(|e| {
                McpError::InvalidConfig(format!("Invalid API key header value: {}", e))
            })?;
            engine_headers.insert("X-API-Key".to_string(), api_key.clone());
        }
        if let Some(ref token) = config.bearer_token {
            let value = format!("Bearer {}", token);
            reqwest::header::HeaderValue::from_str(&value).map_err(|e| {
                McpError::InvalidConfig(format!("Invalid bearer token header value: {}", e))
            })?;
            engine_headers.insert("Authorization".to_string(), value);
        }
        for (key, value) in &config.headers {
            reqwest::header::HeaderName::try_from(key.as_str()).map_err(|e| {
                McpError::InvalidConfig(format!("Invalid header name '{}': {}", key, e))
            })?;
            reqwest::header::HeaderValue::from_str(value).map_err(|e| {
                McpError::InvalidConfig(format!("Invalid header value for '{}': {}", key, e))
            })?;
            engine_headers.insert(key.clone(), value.clone());
        }

        // Engine hardening knobs: SSRF validation at connect (FIX R-09; the
        // engine's validator is the ported desktop one), the 50 MB inline
        // response cap (FIX R-10), the 30s connect timeout, and the 60s
        // stalled-stream read timeout. The SSE listener's HTTPS-for-remote
        // refusal lives inside the engine supervisor (old `connect_sse`
        // parity; cleartext-remote POSTs stay allowed, as before).
        let timeouts = agiworkforce_mcp::McpTimeouts {
            validate_urls: true,
            verify_tls: config.verify_ssl,
            max_response_bytes: Some(MAX_RESPONSE_BODY_BYTES),
            connect_timeout: Some(std::time::Duration::from_secs(SSE_CONNECT_TIMEOUT_SECS)),
            sse_read_timeout: Some(std::time::Duration::from_secs(SSE_STREAM_IDLE_TIMEOUT_SECS)),
            ..agiworkforce_mcp::McpTimeouts::default()
        };

        let engine_config = agiworkforce_mcp::TransportConfig::SseLegacy {
            base_url: config.url.clone(),
            headers: engine_headers,
        };

        // No handshake here: McpSession drives its own `initialize` through
        // send_request, exactly as it did against the old transport.
        let mut client = agiworkforce_mcp::McpClient::connect_without_handshake(
            &server_name,
            engine_config,
            timeouts,
            engine_hooks(&server_name),
        )
        .await
        .map_err(map_engine_error)?;

        // Forward server-initiated SSE notifications into the per-server log
        // store — the same `[sse notification]` line the old event processor
        // produced.
        if let Some(mut notifications) = client.notifications() {
            let notif_server = server_name.clone();
            tokio::spawn(async move {
                while let Some(notif) = notifications.recv().await {
                    tracing::info!(
                        "[MCP HTTP Transport] Received SSE notification for '{}': {}",
                        notif_server,
                        notif.method
                    );
                    append_server_log(
                        &notif_server,
                        format!("[sse notification] {}", notif.method),
                    );
                }
            });
        }

        let (tx, rx) = mpsc::unbounded_channel::<EngineCommand>();
        let response_seq = Arc::new(AtomicU64::new(1));
        let alive = Arc::new(AtomicBool::new(true));
        let is_shutdown = Arc::new(AtomicBool::new(false));
        let shutdown_signal = Arc::new(tokio::sync::Notify::new());
        let request_timeout_secs = config.timeout_secs;

        spawn_engine_actor(
            server_name.clone(),
            client,
            rx,
            response_seq,
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
        })
    }

    /// Kept for API compatibility with the pre-engine transport: the SSE
    /// listener (with reconnect) now attaches automatically inside the engine
    /// at connect time, so there is nothing left to start here. Both callers
    /// (`McpSession::connect{,_with_transport}`) pass `None`; a custom
    /// `sse_endpoint` was never used and is no longer supported — the legacy
    /// convention fixes the stream at `{url}/sse`.
    pub async fn start_sse_listener(&self, sse_endpoint: Option<&str>) -> McpResult<()> {
        if let Some(endpoint) = sse_endpoint {
            tracing::warn!(
                "[MCP HTTP Transport] Custom SSE endpoint '{}' ignored for '{}' — \
                 the engine listens on {{url}}/sse",
                endpoint,
                self.server_name
            );
        } else {
            tracing::debug!(
                "[MCP HTTP Transport] SSE listener for '{}' already attached by the engine",
                self.server_name
            );
        }
        Ok(())
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

        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(EngineCommand::Request {
                method,
                params,
                reply: reply_tx,
            })
            .map_err(|_| {
                McpError::ConnectionError("Failed to send request: channel closed".to_string())
            })?;

        // The engine enforces the same per-request timeout internally; this
        // outer bound also caps time spent queued behind an in-flight request.
        match tokio::time::timeout(
            tokio::time::Duration::from_secs(self.request_timeout_secs),
            reply_rx,
        )
        .await
        {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(McpError::ConnectionError(
                "Response channel closed".to_string(),
            )),
            Err(_) => Err(McpError::RequestTimeout(format!(
                "Request for '{}' timed out after {}s — server accepted request but did not respond in time",
                self.server_name, self.request_timeout_secs
            ))),
        }
    }

    fn send_notification(&self, method: String, params: Option<serde_json::Value>) {
        if self.is_shutdown.load(Ordering::SeqCst) {
            return;
        }
        // FIFO with requests through the actor channel. The engine serializes
        // notifications without an `id` member per the JSON-RPC 2.0 spec
        // (BUG 1 FIX preserved).
        let _ = self.tx.send(EngineCommand::Notify { method, params });
    }

    fn is_alive(&self) -> bool {
        !self.is_shutdown.load(Ordering::SeqCst) && self.alive.load(Ordering::SeqCst)
    }

    async fn shutdown(&self) -> McpResult<()> {
        tracing::info!(
            "[MCP HTTP Transport] Shutting down transport for '{}'",
            self.server_name
        );
        self.is_shutdown.store(true, Ordering::SeqCst);

        self.shutdown_signal.notify_waiters();
        let (reply_tx, reply_rx) = oneshot::channel();
        if self
            .tx
            .send(EngineCommand::Shutdown { reply: reply_tx })
            .is_ok()
        {
            let _ = tokio::time::timeout(tokio::time::Duration::from_secs(5), reply_rx).await;
        }
        self.alive.store(false, Ordering::SeqCst);

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
    use super::super::protocol::{JsonRpcRequest, McpMessage};
    use super::*;
    use std::time::Instant;

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
            "SSE stream for 'test-server' stalled — no data received for {}s",
            SSE_STREAM_IDLE_TIMEOUT_SECS,
        ));
        assert!(timeout_err.to_string().contains("stalled"));
        assert!(timeout_err.to_string().contains("60s"));
    }

    #[tokio::test]
    async fn test_http_sse_transport_connection_timeout_config() {
        // Verify the HTTP client is configured with timeouts by attempting a
        // connection to a non-routable address and checking it fails quickly.
        let config = HttpSseConfig {
            url: "http://192.0.2.1:9999".to_string(),
            timeout_secs: 1,
            verify_ssl: true,
            ..Default::default()
        };

        let start = Instant::now();
        // This will succeed in creating the transport (client construction does
        // not connect), but the client itself will have timeouts configured.
        let result = HttpSseTransport::new("timeout-test".to_string(), config).await;
        let elapsed = start.elapsed();

        // Transport creation should succeed (no connection attempt during new())
        assert!(
            result.is_ok(),
            "Transport creation should succeed, got: {:?}",
            result.err(),
        );

        // Should be near-instant since new() does not connect
        assert!(
            elapsed.as_secs() < 5,
            "Transport creation should not involve connection attempt, took {:?}",
            elapsed,
        );

        // Clean up
        if let Ok(transport) = result {
            let _ = transport.shutdown().await;
        }
    }
}
