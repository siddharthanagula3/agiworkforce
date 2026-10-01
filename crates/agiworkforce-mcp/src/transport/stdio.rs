use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError, TryLockError};
use std::time::Duration;

use anyhow::{Context, Result, anyhow};
use serde_json::{Value, json};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

use crate::cache::Events;
use crate::config::{McpTimeouts, TransportConfig};
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
    stderr_reader: Option<JoinHandle<()>>,
}

impl StdioConn {
    pub(crate) fn spawn(
        server_name: &str,
        config: &TransportConfig,
        timeouts: &McpTimeouts,
        stderr_buf: &Arc<StderrBuffer>,
        events: Arc<Events>,
        hooks: ClientHooks,
    ) -> Result<Self> {
        let TransportConfig::Stdio { command, args, env } = config else {
            return Err(anyhow!("MCP stdio transport configuration required"));
        };
        let mut child = spawn_child(server_name, command, args, env)?;
        let stdin = child
            .stdin
            .take()
            .with_context(|| format!("[{server_name}] MCP server stdin not available"))?;
        let stdout = child
            .stdout
            .take()
            .with_context(|| format!("[{server_name}] MCP server stdout not available"))?;
        let stderr = child
            .stderr
            .take()
            .with_context(|| format!("[{server_name}] MCP server stderr not available"))?;
        let stderr_reader = tokio::spawn(read_stderr(
            stderr,
            Arc::clone(stderr_buf),
            server_name.to_string(),
            std::env::var("AGIWORKFORCE_MCP_DEBUG").is_ok(),
        ));
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
        let reader = tokio::spawn(read_loop(stdout, router, timeouts.frame_cap()));
        Ok(Self {
            server_name: server_name.to_string(),
            child,
            writer,
            pending,
            closed,
            answers_server_requests,
            reader,
            stderr_reader: Some(stderr_reader),
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
        if let Some(stderr_reader) = self.stderr_reader.as_mut() {
            if tokio::time::timeout(EXIT_GRACE, &mut *stderr_reader)
                .await
                .is_err()
            {
                stderr_reader.abort();
                let _ = stderr_reader.await;
            }
        }
        self.stderr_reader.take();
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
        if let Some(stderr_reader) = self.stderr_reader.take() {
            stderr_reader.abort();
        }
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

fn append_stdout_frame(frame: &mut Vec<u8>, bytes: &[u8], max_frame: usize) -> Result<()> {
    if bytes.len() > max_frame.saturating_sub(frame.len()) {
        return Err(anyhow!("MCP stdout frame exceeded {max_frame} bytes"));
    }
    let needed = frame.len() + bytes.len();
    if needed > frame.capacity() {
        let capacity = frame
            .capacity()
            .saturating_mul(2)
            .max(needed)
            .min(max_frame);
        frame.try_reserve_exact(capacity - frame.len())?;
    }
    frame.extend_from_slice(bytes);
    Ok(())
}

async fn read_stdout_frame<R: AsyncBufRead + Unpin>(
    reader: &mut R,
    max_frame: usize,
) -> Result<Option<String>> {
    let mut frame = Vec::new();
    let mut trailing_cr = false;
    loop {
        let available = reader.fill_buf().await?;
        if available.is_empty() {
            return if frame.is_empty() {
                Ok(None)
            } else {
                Ok(Some(String::from_utf8(frame)?))
            };
        }
        let newline = available.iter().position(|byte| *byte == b'\n');
        let end = newline.unwrap_or(available.len());
        let mut bytes = &available[..end];
        if trailing_cr && !bytes.is_empty() {
            append_stdout_frame(&mut frame, b"\r", max_frame)?;
        }
        trailing_cr = bytes.last() == Some(&b'\r');
        if trailing_cr {
            bytes = &bytes[..bytes.len() - 1];
        }
        append_stdout_frame(&mut frame, bytes, max_frame)?;
        let consumed = end + usize::from(newline.is_some());
        reader.consume(consumed);
        if newline.is_some() {
            return Ok(Some(String::from_utf8(frame)?));
        }
    }
}

async fn read_loop(stdout: ChildStdout, router: Router, max_frame: usize) {
    let mut reader = BufReader::new(stdout);
    loop {
        let line = match read_stdout_frame(&mut reader, max_frame).await {
            Ok(Some(line)) => line,
            Ok(None) => break,
            Err(_) => {
                tracing::warn!("MCP stdout frame read failed");
                break;
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(trimmed) {
            Ok(frame) => router.route(frame),
            Err(_) => tracing::warn!("MCP stdout contained a non-JSON frame"),
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

const STDERR_TRUNCATED: &str = " [stderr truncated]";
const STDERR_OMITTED: &str = "[stderr omitted]";
const STDERR_READ_FAILED: &str = "[stderr read failed]";

#[derive(Default)]
struct StderrLines {
    lines: VecDeque<String>,
    bytes: usize,
    omitted: bool,
}

pub(crate) struct StderrBuffer {
    lines: Mutex<StderrLines>,
    omitted: AtomicBool,
    line_cap: usize,
    byte_cap: usize,
    entry_cap: usize,
}

impl StderrBuffer {
    pub(crate) fn new(timeouts: &McpTimeouts) -> Self {
        Self {
            lines: Mutex::new(StderrLines::default()),
            omitted: AtomicBool::new(false),
            line_cap: timeouts.stderr_line_cap().min(timeouts.stderr_buffer_cap()),
            byte_cap: timeouts.stderr_buffer_cap(),
            entry_cap: timeouts.stderr_lines_cap(),
        }
    }

    fn push(&self, line: String) {
        let line = if line.len() > self.line_cap {
            bounded_text(&line, self.line_cap, true)
        } else {
            line
        };
        if line.is_empty() || self.entry_cap == 0 {
            return;
        }
        let mut locked = match self.lines.try_lock() {
            Ok(locked) => locked,
            Err(TryLockError::Poisoned(error)) => error.into_inner(),
            Err(TryLockError::WouldBlock) => {
                self.omitted.store(true, Ordering::SeqCst);
                return;
            }
        };
        self.make_room(&mut locked, line.len());
        locked.bytes += line.len();
        locked.lines.push_back(line);
    }

    fn make_room(&self, locked: &mut StderrLines, incoming_bytes: usize) {
        while locked.lines.len() >= self.entry_cap
            || incoming_bytes > self.byte_cap.saturating_sub(locked.bytes)
        {
            let Some(oldest) = locked.lines.pop_front() else {
                break;
            };
            locked.bytes -= oldest.len();
            locked.omitted = true;
        }
    }

    fn add_omission(&self, locked: &mut StderrLines) {
        let omitted = self.omitted.swap(false, Ordering::SeqCst) || locked.omitted;
        locked.omitted = false;
        if omitted && self.entry_cap > 0 {
            let marker = bounded_text(STDERR_OMITTED, self.line_cap, false);
            let latest_bytes = locked.lines.back().map_or(0, String::len);
            let retains_latest = locked.lines.is_empty()
                || (self.entry_cap > 1
                    && marker.len() <= self.byte_cap.saturating_sub(latest_bytes));
            if !marker.is_empty() && retains_latest {
                self.make_room(locked, marker.len());
                locked.bytes += marker.len();
                locked.lines.push_front(marker);
                locked.omitted = false;
            }
        }
    }

    pub(crate) fn drain(&self) -> Vec<String> {
        let mut locked = self.lines.lock().unwrap_or_else(PoisonError::into_inner);
        self.add_omission(&mut locked);
        locked.bytes = 0;
        locked.lines.drain(..).collect()
    }

    pub(crate) fn snapshot(&self) -> Vec<String> {
        let mut locked = self.lines.lock().unwrap_or_else(PoisonError::into_inner);
        self.add_omission(&mut locked);
        locked.lines.iter().cloned().collect()
    }
}

fn bounded_text(text: &str, cap: usize, truncated: bool) -> String {
    let truncated = truncated || text.len() > cap;
    let suffix = if truncated && cap >= STDERR_TRUNCATED.len() {
        STDERR_TRUNCATED
    } else {
        ""
    };
    let mut end = text.len().min(cap - suffix.len());
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    let mut bounded = String::with_capacity(end + suffix.len());
    bounded.push_str(&text[..end]);
    bounded.push_str(suffix);
    bounded
}

struct StderrLine {
    bytes: Vec<u8>,
    truncated: bool,
    cap: usize,
}

impl StderrLine {
    fn new(cap: usize) -> Self {
        Self {
            bytes: Vec::with_capacity(cap),
            truncated: false,
            cap,
        }
    }

    fn append(&mut self, bytes: &[u8]) {
        let count = bytes.len().min(self.cap.saturating_sub(self.bytes.len()));
        self.bytes.extend_from_slice(&bytes[..count]);
        self.truncated |= count < bytes.len();
    }

    fn finish(&mut self) -> String {
        if !self.truncated {
            while self.bytes.last() == Some(&b'\r') {
                self.bytes.pop();
            }
        }
        let line = bounded_text(
            &String::from_utf8_lossy(&self.bytes),
            self.cap,
            self.truncated,
        );
        self.bytes.clear();
        self.truncated = false;
        line
    }
}

async fn read_stderr<R: AsyncRead + Unpin>(
    mut stderr: R,
    buf: Arc<StderrBuffer>,
    server: String,
    debug: bool,
) {
    let mut chunk = [0; 8192];
    let mut line = StderrLine::new(buf.line_cap);
    loop {
        let count = match stderr.read(&mut chunk).await {
            Ok(0) => {
                emit_stderr(&buf, line.finish(), &server, debug);
                return;
            }
            Ok(count) => count,
            Err(_) => {
                tracing::warn!("MCP stderr read failed");
                emit_stderr(&buf, line.finish(), &server, debug);
                emit_stderr(
                    &buf,
                    bounded_text(STDERR_READ_FAILED, buf.line_cap, false),
                    &server,
                    debug,
                );
                return;
            }
        };
        let mut remaining = &chunk[..count];
        while let Some(end) = remaining.iter().position(|byte| *byte == b'\n') {
            line.append(&remaining[..end]);
            emit_stderr(&buf, line.finish(), &server, debug);
            remaining = &remaining[end + 1..];
        }
        line.append(remaining);
        tokio::task::yield_now().await;
    }
}

fn emit_stderr(buf: &StderrBuffer, line: String, server: &str, debug: bool) {
    if line.is_empty() {
        return;
    }
    if debug {
        eprintln!("[{server}] stderr: {line}");
    }
    buf.push(line);
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

#[cfg(test)]
mod stdout_tests {
    use super::*;

    #[test]
    fn frame_bytes_and_allocation_never_grow_past_the_configured_cap() {
        let mut frame = Vec::new();
        for _ in 0..16 {
            append_stdout_frame(&mut frame, &[b'x'; 2], 32).unwrap();
            assert!(frame.len() <= 32);
            assert!(frame.capacity() <= 32);
        }
        let retained = frame.clone();
        let capacity = frame.capacity();
        assert!(append_stdout_frame(&mut frame, b"x", 32).is_err());
        assert_eq!(frame, retained);
        assert_eq!(frame.capacity(), capacity);
    }

    #[tokio::test]
    async fn delimiters_do_not_count_against_exact_frame_boundaries() {
        for input in [b"1234\n".as_slice(), b"1234\r\n", b"1234\r"] {
            let mut reader = BufReader::with_capacity(1, input);
            assert_eq!(
                read_stdout_frame(&mut reader, 4).await.unwrap(),
                Some("1234".to_string())
            );
            assert!(read_stdout_frame(&mut reader, 4).await.unwrap().is_none());
        }
        let mut reader = BufReader::with_capacity(1, &b"12\r34\n"[..]);
        assert_eq!(
            read_stdout_frame(&mut reader, 5).await.unwrap(),
            Some("12\r34".to_string())
        );
        let mut reader = BufReader::with_capacity(1, &b"12\r34\n"[..]);
        assert!(read_stdout_frame(&mut reader, 4).await.is_err());
    }

    #[tokio::test]
    async fn zero_caps_utf8_partial_eof_and_blank_frames_preserve_wire_behavior() {
        let mut reader = BufReader::with_capacity(1, &b"\n\r\n"[..]);
        assert_eq!(
            read_stdout_frame(&mut reader, 0).await.unwrap(),
            Some(String::new())
        );
        assert_eq!(
            read_stdout_frame(&mut reader, 0).await.unwrap(),
            Some(String::new())
        );
        assert!(read_stdout_frame(&mut reader, 0).await.unwrap().is_none());
        let mut reader = BufReader::with_capacity(1, &b"x\n"[..]);
        assert!(read_stdout_frame(&mut reader, 0).await.is_err());
        let mut reader = BufReader::with_capacity(1, "λ🙂".as_bytes());
        assert_eq!(
            read_stdout_frame(&mut reader, 6).await.unwrap(),
            Some("λ🙂".to_string())
        );
        let mut reader = BufReader::with_capacity(1, &[0xff, b'\n'][..]);
        assert!(read_stdout_frame(&mut reader, 1).await.is_err());
    }

    #[tokio::test]
    async fn an_open_pipe_is_refused_before_newline_or_eof() {
        let (mut writer, reader) = tokio::io::duplex(128);
        writer.write_all(&[b'x'; 65]).await.unwrap();
        let mut reader = BufReader::with_capacity(8, reader);
        let error =
            tokio::time::timeout(Duration::from_secs(2), read_stdout_frame(&mut reader, 64))
                .await
                .expect("an oversized open frame must not wait for a delimiter")
                .expect_err("an oversized open frame must be rejected");
        assert!(error.to_string().contains("frame exceeded 64 bytes"));
        drop(writer);
    }
}

#[cfg(test)]
mod stderr_tests {
    use super::*;
    use std::pin::Pin;
    use std::task::{Context, Poll};
    use tokio::io::ReadBuf;

    fn buffer(line: usize, bytes: usize, entries: usize) -> Arc<StderrBuffer> {
        Arc::new(StderrBuffer::new(&McpTimeouts {
            max_stderr_line_bytes: Some(line),
            max_stderr_buffer_bytes: Some(bytes),
            max_stderr_lines: Some(entries),
            ..McpTimeouts::default()
        }))
    }

    #[test]
    fn accumulation_and_decoded_utf8_fit_the_same_line_budget() {
        let mut line = StderrLine::new(32);
        for _ in 0..1000 {
            line.append(&[0xff; 8192]);
            assert!(line.bytes.len() <= 32);
            assert!(line.bytes.capacity() <= 32);
        }
        let decoded = line.finish();
        assert!(decoded.len() <= 32);
        assert!(decoded.ends_with(STDERR_TRUNCATED));
        assert!(decoded.contains('\u{fffd}'));
        assert!(line.finish().is_empty());
    }

    #[tokio::test]
    async fn split_utf8_crlf_empty_and_partial_eof_are_deterministic() {
        let buf = buffer(64, 1024, 10);
        let (mut write, read) = tokio::io::duplex(1);
        let writer = tokio::spawn(async move {
            write
                .write_all("λ🙂\r\n\n\r\nend".as_bytes())
                .await
                .unwrap();
            write.write_all(&[0xff]).await.unwrap();
        });
        read_stderr(read, Arc::clone(&buf), "unit".to_string(), false).await;
        writer.await.unwrap();
        assert_eq!(buf.drain(), vec!["λ🙂", "end\u{fffd}"]);
        assert!(buf.drain().is_empty());
    }

    #[test]
    fn queue_bytes_and_entries_preserve_newest_lines_and_bounded_markers() {
        let buf = buffer(32, 80, 3);
        for n in 0..100 {
            buf.push(format!("row {n:03} {}", "x".repeat(22)));
            let locked = buf.lines.lock().unwrap();
            assert!(locked.lines.len() <= 3);
            assert!(locked.bytes <= 80);
            assert_eq!(
                locked.bytes,
                locked.lines.iter().map(String::len).sum::<usize>()
            );
        }
        let lines = buf.drain();
        assert!(lines.len() <= 3);
        assert!(lines.iter().map(String::len).sum::<usize>() <= 80);
        assert_eq!(lines.first().map(String::as_str), Some(STDERR_OMITTED));
        assert!(lines.last().unwrap().starts_with("row 099 "));
        buf.push("fresh".to_string());
        assert_eq!(buf.drain(), vec!["fresh"]);
    }

    #[test]
    fn omission_marker_never_displaces_the_latest_diagnostic() {
        for (bytes, entries) in [(64, 1), (32, 3)] {
            let buf = buffer(32, bytes, entries);
            buf.push("older".to_string());
            let recent = "r".repeat(32);
            buf.push(recent.clone());
            assert_eq!(buf.drain(), vec![recent]);
            assert!(buf.drain().is_empty());
        }
    }

    #[test]
    fn contended_queue_drops_without_waiting_and_records_omission() {
        let buf = buffer(32, 80, 3);
        let locked = buf.lines.lock().unwrap();
        buf.push("contended".to_string());
        drop(locked);
        buf.push("recent".to_string());
        assert_eq!(buf.drain(), vec![STDERR_OMITTED, "recent"]);
    }

    #[test]
    fn poisoned_queue_recovers_owned_diagnostics() {
        let buf = buffer(32, 80, 3);
        let owned = Arc::clone(&buf);
        assert!(
            std::panic::catch_unwind(move || {
                let _locked = owned.lines.lock().unwrap();
                panic!("synthetic poisoning");
            })
            .is_err()
        );
        buf.push("recent".to_string());
        assert_eq!(buf.snapshot(), vec!["recent"]);
        assert_eq!(buf.drain(), vec!["recent"]);
    }

    #[tokio::test]
    async fn zero_budgets_and_tiny_multibyte_limits_remain_bounded() {
        for (line, bytes, entries) in [(0, 80, 3), (32, 0, 3), (32, 80, 0)] {
            let buf = buffer(line, bytes, entries);
            read_stderr(
                &b"diagnostic\n"[..],
                Arc::clone(&buf),
                "unit".to_string(),
                false,
            )
            .await;
            assert!(buf.drain().is_empty());
        }
        let buf = buffer(2, 2, 1);
        read_stderr(
            "🙂\nλ\n".as_bytes(),
            Arc::clone(&buf),
            "unit".to_string(),
            false,
        )
        .await;
        let lines = buf.drain();
        assert_eq!(lines, vec!["λ"]);
        assert!(lines.iter().map(String::len).sum::<usize>() <= 2);
    }

    struct DropWitness(Arc<AtomicBool>);

    impl Drop for DropWitness {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }

    #[tokio::test]
    async fn cancelled_shutdown_keeps_stderr_task_owned_until_connection_drop() {
        let mut child = Command::new(std::env::current_exe().unwrap())
            .arg("--list")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        tokio::time::timeout(Duration::from_secs(2), child.wait())
            .await
            .unwrap()
            .unwrap();
        let dropped = Arc::new(AtomicBool::new(false));
        let witnessed = Arc::clone(&dropped);
        let (started_tx, started_rx) = oneshot::channel();
        let stderr_reader = tokio::spawn(async move {
            let _witness = DropWitness(witnessed);
            started_tx.send(()).unwrap();
            std::future::pending::<()>().await;
        });
        started_rx.await.unwrap();
        let mut conn = StdioConn {
            server_name: "unit".to_string(),
            child,
            writer: Arc::new(tokio::sync::Mutex::new(None)),
            pending: Arc::default(),
            closed: Arc::new(AtomicBool::new(false)),
            answers_server_requests: Arc::new(AtomicBool::new(false)),
            reader: tokio::spawn(std::future::pending()),
            stderr_reader: Some(stderr_reader),
        };
        let mut shutdown = Box::pin(conn.shutdown());
        assert!(
            tokio::time::timeout(Duration::from_millis(20), shutdown.as_mut())
                .await
                .is_err()
        );
        drop(shutdown);
        assert!(!dropped.load(Ordering::SeqCst));
        drop(conn);
        tokio::time::timeout(Duration::from_secs(2), async {
            while !dropped.load(Ordering::SeqCst) {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("stderr task must be aborted when the connection drops");
    }

    struct ReadFailure(bool);

    impl AsyncRead for ReadFailure {
        fn poll_read(
            self: Pin<&mut Self>,
            _cx: &mut Context<'_>,
            buf: &mut ReadBuf<'_>,
        ) -> Poll<std::io::Result<()>> {
            let state = self.get_mut();
            if !state.0 {
                state.0 = true;
                buf.put_slice(b"partial");
                Poll::Ready(Ok(()))
            } else {
                Poll::Ready(Err(std::io::Error::other("private exception detail")))
            }
        }
    }

    #[tokio::test]
    async fn read_error_retains_partial_context_and_fixed_safe_diagnostic() {
        let buf = buffer(64, 128, 3);
        read_stderr(
            ReadFailure(false),
            Arc::clone(&buf),
            "unit".to_string(),
            false,
        )
        .await;
        assert_eq!(buf.drain(), vec!["partial", STDERR_READ_FAILED]);
    }
}
