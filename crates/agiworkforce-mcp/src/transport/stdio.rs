use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{Context, Result, anyhow};
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

use crate::cache::Events;
use crate::error::TransportFault;
use crate::hooks::ClientHooks;
use crate::jsonrpc::notification_frame;
use crate::peer_requests;

pub const INHERITED_ENV_ALLOWLIST: &[&str] = &[
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "TERM",
    "SHELL",
    "XDG_RUNTIME_DIR",
];

const BLOCKED_MANIFEST_VARS: &[&str] = &[
    "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH",
    "DYLD_FORCE_FLAT_NAMESPACE",
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "LD_AUDIT",
    "NODE_OPTIONS",
    "PYTHONPATH",
    "RUBYLIB",
    "PERL5LIB",
    "http_proxy",
    "https_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "all_proxy",
];

const EXIT_GRACE: Duration = Duration::from_secs(2);

const UNCANCELLABLE_METHODS: &[&str] = &["initialize", "server/discover"];

type Pending = Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>;
type Writer = Arc<tokio::sync::Mutex<Option<ChildStdin>>>;

pub(crate) struct StdioConn {
    server_name: String,
    child: Child,
    writer: Writer,
    pending: Pending,
    closed: Arc<AtomicBool>,
    answers_server_requests: Arc<AtomicBool>,
    reader: JoinHandle<()>,
}

impl StdioConn {
    pub(crate) fn spawn(
        server_name: &str,
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
        stderr_buf: &Arc<Mutex<Vec<String>>>,
        events: Arc<Events>,
        hooks: ClientHooks,
    ) -> Result<Self> {
        let mut child = spawn_child(server_name, command, args, env)?;
        drain_stderr(&mut child, stderr_buf, server_name);
        let stdin = child
            .stdin
            .take()
            .with_context(|| format!("[{server_name}] MCP server stdin not available"))?;
        let stdout = child
            .stdout
            .take()
            .with_context(|| format!("[{server_name}] MCP server stdout not available"))?;
        let writer: Writer = Arc::new(tokio::sync::Mutex::new(Some(stdin)));
        let pending: Pending = Arc::default();
        let closed = Arc::new(AtomicBool::new(false));
        let answers_server_requests = Arc::new(AtomicBool::new(false));
        let router = Router {
            server_name: server_name.to_string(),
            pending: Arc::clone(&pending),
            closed: Arc::clone(&closed),
            answers_server_requests: Arc::clone(&answers_server_requests),
            writer: Arc::clone(&writer),
            events,
            hooks,
        };
        let reader = tokio::spawn(read_loop(stdout, router));
        Ok(Self {
            server_name: server_name.to_string(),
            child,
            writer,
            pending,
            closed,
            answers_server_requests,
            reader,
        })
    }

    pub(crate) fn answer_server_requests(&self) {
        self.answers_server_requests.store(true, Ordering::SeqCst);
    }

    pub(crate) async fn request(
        &self,
        id: &Value,
        frame: &Value,
        method: &str,
        timeout: Duration,
    ) -> Result<Value> {
        let response = self.open(id, frame).await?;
        match tokio::time::timeout(timeout, response).await {
            Ok(Ok(frame)) => Ok(frame),
            Ok(Err(_)) => Err(self.closed_fault()),
            Err(_) => {
                self.forget(id);
                if !UNCANCELLABLE_METHODS.contains(&method) {
                    let _ = self.cancel(id, "request timed out").await;
                }
                Err(TransportFault::Timeout {
                    server: self.server_name.clone(),
                    millis: timeout.as_millis(),
                    method: method.to_string(),
                }
                .into())
            }
        }
    }

    pub(crate) async fn open(&self, id: &Value, frame: &Value) -> Result<oneshot::Receiver<Value>> {
        if self.closed.load(Ordering::SeqCst) {
            return Err(self.closed_fault());
        }
        let (tx, rx) = oneshot::channel();
        self.pending
            .lock()
            .map_err(|_| anyhow!("[{}] MCP request table poisoned", self.server_name))?
            .insert(pending_key(id), tx);
        if let Err(error) = self.send(frame).await {
            self.forget(id);
            return Err(error);
        }
        Ok(rx)
    }

    pub(crate) async fn send(&self, frame: &Value) -> Result<()> {
        write_frame(&self.writer, frame, &self.server_name).await
    }

    pub(crate) async fn cancel(&self, id: &Value, reason: &str) -> Result<()> {
        self.send(&notification_frame(
            "notifications/cancelled",
            Some(json!({ "requestId": id, "reason": reason })),
        ))
        .await
    }

    pub(crate) fn is_alive(&mut self) -> bool {
        !self.closed.load(Ordering::SeqCst) && matches!(self.child.try_wait(), Ok(None))
    }

    pub(crate) async fn shutdown(&mut self) {
        self.writer.lock().await.take();
        if tokio::time::timeout(EXIT_GRACE, self.child.wait())
            .await
            .is_err()
        {
            terminate(&mut self.child).await;
        }
        self.reader.abort();
    }

    fn forget(&self, id: &Value) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(&pending_key(id));
        }
    }

    fn closed_fault(&self) -> anyhow::Error {
        TransportFault::Closed {
            server: self.server_name.clone(),
        }
        .into()
    }
}

impl Drop for StdioConn {
    fn drop(&mut self) {
        self.reader.abort();
        terminate_now(&mut self.child);
    }
}

fn pending_key(id: &Value) -> String {
    id.to_string()
}

async fn write_frame(writer: &Writer, frame: &Value, server_name: &str) -> Result<()> {
    let mut line = serde_json::to_string(frame)?;
    line.push('\n');
    let mut guard = writer.lock().await;
    let stdin = guard
        .as_mut()
        .with_context(|| format!("[{server_name}] MCP server stdin not available"))?;
    stdin.write_all(line.as_bytes()).await?;
    stdin.flush().await?;
    Ok(())
}

struct Router {
    server_name: String,
    pending: Pending,
    closed: Arc<AtomicBool>,
    answers_server_requests: Arc<AtomicBool>,
    writer: Writer,
    events: Arc<Events>,
    hooks: ClientHooks,
}

impl Router {
    fn route(&self, frame: Value) {
        if let Some((method, id, params)) = peer_requests::server_request(&frame) {
            self.answer(method, id, params);
        } else if let Some((method, params)) = peer_requests::notification(&frame) {
            self.events.notify(method, params);
        } else if let Some(key) = frame.get("id").map(pending_key) {
            let waiter = self
                .pending
                .lock()
                .ok()
                .and_then(|mut pending| pending.remove(&key));
            if let Some(waiter) = waiter {
                let _ = waiter.send(frame);
            }
        }
    }

    fn answer(&self, method: String, id: Value, params: Option<Value>) {
        if !self.answers_server_requests.load(Ordering::SeqCst) {
            tracing::warn!(
                "[{}] ignoring server-initiated '{method}' outside a legacy session",
                self.server_name
            );
            return;
        }
        let writer = Arc::clone(&self.writer);
        let hooks = self.hooks.clone();
        let server = self.server_name.clone();
        tokio::spawn(async move {
            let reply = peer_requests::answer(&server, &hooks, &method, id, params).await;
            if let Err(error) = write_frame(&writer, &reply, &server).await {
                tracing::warn!("[{server}] could not answer '{method}': {error:#}");
            }
        });
    }
}

async fn read_loop(stdout: ChildStdout, router: Router) {
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(trimmed) {
            Ok(frame) => router.route(frame),
            Err(_) => eprintln!("[{}] Skipped non-JSON line: {trimmed}", router.server_name),
        }
    }
    router.closed.store(true, Ordering::SeqCst);
    if let Ok(mut pending) = router.pending.lock() {
        pending.clear();
    }
}

fn spawn_child(
    name: &str,
    command: &str,
    args: &[String],
    env: &HashMap<String, String>,
) -> Result<Child> {
    let mut cmd = Command::new(command);
    cmd.args(args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    cmd.env_clear();
    for var in INHERITED_ENV_ALLOWLIST {
        if let Ok(val) = std::env::var(var) {
            cmd.env(var, val);
        }
    }

    for (key, val) in env {
        let blocked = BLOCKED_MANIFEST_VARS
            .iter()
            .any(|b| b.eq_ignore_ascii_case(key));
        if blocked {
            eprintln!(
                "[{name}] security: manifest env var {key:?} is blocked (loader-injection / proxy hijack risk)"
            );
            continue;
        }
        if key.to_uppercase().ends_with("_PROXY") {
            eprintln!("[{name}] security: manifest env var {key:?} is blocked (proxy hijack risk)");
            continue;
        }
        cmd.env(key, val);
    }

    cmd.spawn().with_context(|| {
        format!(
            "[{name}] Failed to start MCP server: {command} {}",
            args.join(" ")
        )
    })
}

fn drain_stderr(child: &mut Child, stderr_buf: &Arc<Mutex<Vec<String>>>, name: &str) {
    let stderr_debug = std::env::var("AGIWORKFORCE_MCP_DEBUG").is_ok();
    if let Some(raw_stderr) = child.stderr.take() {
        let buf = Arc::clone(stderr_buf);
        let server = name.to_string();
        tokio::spawn(async move {
            let mut reader = BufReader::new(raw_stderr);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        let trimmed = line.trim_end_matches('\n').trim_end_matches('\r');
                        if !trimmed.is_empty() {
                            if stderr_debug {
                                eprintln!("[{server}] stderr: {trimmed}");
                            }
                            if let Ok(mut locked) = buf.lock() {
                                locked.push(trimmed.to_string());
                            }
                        }
                    }
                }
            }
        });
    }
}

#[cfg(unix)]
async fn terminate(child: &mut Child) {
    use nix::sys::signal::{Signal, kill};
    use nix::unistd::Pid;

    if let Some(pid) = child.id() {
        let pid = Pid::from_raw(pid as i32);
        let _ = kill(pid, Signal::SIGTERM);
        if tokio::time::timeout(EXIT_GRACE, child.wait())
            .await
            .is_err()
        {
            let _ = kill(pid, Signal::SIGKILL);
            let _ = child.wait().await;
        }
    }
}

#[cfg(not(unix))]
async fn terminate(child: &mut Child) {
    let _ = child.kill().await;
}

#[cfg(unix)]
fn terminate_now(child: &mut Child) {
    use nix::sys::signal::{Signal, kill};
    use nix::unistd::Pid;

    if let Some(pid) = child.id() {
        let pid = Pid::from_raw(pid as i32);
        let _ = kill(pid, Signal::SIGTERM);
        std::thread::sleep(Duration::from_millis(100));
        if child.try_wait().ok().flatten().is_none() {
            let _ = kill(pid, Signal::SIGKILL);
        }
    }
}

#[cfg(not(unix))]
fn terminate_now(child: &mut Child) {
    let _ = child.start_kill();
}
