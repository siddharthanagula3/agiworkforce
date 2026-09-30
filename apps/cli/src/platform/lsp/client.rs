//! Stdio LSP client. Spawns a language server subprocess, runs the
//! initialize → initialized handshake, then exposes definition / hover /
//! diagnostics methods. Per-language config: server binary path + args.

use anyhow::{Context, Result};
use serde_json::Value;
use std::path::Path;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, ChildStdout, Command};
use tokio::sync::RwLock;

use crate::lsp::types::Diagnostic;

const LSP_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
const LSP_SHUTDOWN_GRACE: std::time::Duration = std::time::Duration::from_secs(2);

/// Build a well-formed `file://` URI from a filesystem path.
///
/// Naive `format!("file://{}", path)` produces malformed URIs for paths
/// containing spaces, `#`, `?`, or other reserved characters, and does not
/// handle Windows drive letters / backslashes, so LSP requests for such files
/// silently target the wrong (or no) document. This helper percent-encodes each
/// path segment (preserving `/` as the separator), normalizes Windows
/// backslashes to `/`, and emits the canonical `file:///C:/...` drive form on
/// Windows.
pub(crate) fn path_to_file_uri(path: &Path) -> String {
    // Normalize separators: on Windows a path may contain backslashes; LSP
    // file URIs always use forward slashes.
    let raw = path.to_string_lossy();
    let normalized = raw.replace('\\', "/");

    // Detect a Windows drive prefix like `C:` so we can emit `file:///C:/...`.
    let bytes = normalized.as_bytes();
    let has_drive = bytes.len() >= 2
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes.len() == 2 || bytes[2] == b'/');

    // Percent-encode each path segment individually so `/` stays a separator
    // but spaces, `#`, `?`, etc. inside a segment are escaped. A leading drive
    // letter segment (`C:`) is preserved verbatim, the colon is valid there.
    let encode_segment = |seg: &str, idx: usize| -> String {
        if has_drive && idx == 0 {
            // Keep the `C:` drive designator literal.
            seg.to_string()
        } else {
            urlencoding::encode(seg).into_owned()
        }
    };

    let encoded: Vec<String> = normalized
        .split('/')
        .enumerate()
        .map(|(idx, seg)| encode_segment(seg, idx))
        .collect();
    let encoded_path = encoded.join("/");

    if has_drive || !encoded_path.starts_with('/') {
        // `C:/foo bar` -> `file:///C:/foo%20bar`
        format!("file:///{encoded_path}")
    } else {
        // Absolute unix path: the split keeps a leading empty segment so the
        // join already yields `/...`, giving `file:///foo%20bar`.
        format!("file://{encoded_path}")
    }
}

fn response_for(frame: &Value, id: i64) -> Option<Result<Value>> {
    if frame.get("method").is_some() || frame.get("id").and_then(Value::as_i64) != Some(id) {
        return None;
    }
    if let Some(error) = frame.get("error") {
        let code = error.get("code").and_then(Value::as_i64);
        let message = error.get("message").and_then(Value::as_str);
        return Some(Err(match (code, message) {
            (Some(code), Some(message)) => {
                anyhow::anyhow!("language server error {code}: {message}")
            }
            _ => anyhow::anyhow!("language server error: {error}"),
        }));
    }
    Some(
        frame
            .get("result")
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("malformed LSP response to id {id}: no result")),
    )
}

/// In-memory buffer for LSP publishDiagnostics notifications.
// Real push-diagnostics requires a dedicated async notification reader loop
// running concurrently with the request channel, out of scope for M36 MVP.
// The buffer API is in place so callers compile; it stays empty until wired.
#[derive(Default, Clone)]
pub struct DiagnosticsBuffer {
    inner: Arc<RwLock<Vec<(String, Vec<Diagnostic>)>>>,
}

impl DiagnosticsBuffer {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn handle(&self) -> Arc<RwLock<Vec<(String, Vec<Diagnostic>)>>> {
        self.inner.clone()
    }
    pub async fn for_uri(&self, uri: &str) -> Vec<Diagnostic> {
        let r = self.inner.read().await;
        r.iter()
            .find(|(u, _)| u == uri)
            .map(|(_, d)| d.clone())
            .unwrap_or_default()
    }
    pub async fn replace(&self, uri: String, diags: Vec<Diagnostic>) {
        let mut w = self.inner.write().await;
        if let Some(entry) = w.iter_mut().find(|(u, _)| *u == uri) {
            entry.1 = diags;
        } else {
            w.push((uri, diags));
        }
    }
    pub async fn count(&self) -> usize {
        self.inner.read().await.iter().map(|(_, d)| d.len()).sum()
    }
}

#[allow(dead_code)]
pub struct LspClient {
    child: crate::process_tree::ProcessTreeChild,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: AtomicI64,
    diagnostics_buffer: DiagnosticsBuffer,
}

// Upper bound on a single LSP frame to cap memory: a malicious/buggy
// server could otherwise send a multi-GB Content-Length and OOM us.
const MAX_CONTENT_LENGTH: usize = 32 * 1024 * 1024;
// Bound how many interleaved notifications/other responses we skip
// before giving up on finding our id.
const MAX_FRAMES: usize = 1024;

impl LspClient {
    pub async fn spawn(
        server_cmd: &str,
        server_args: &[&str],
        workspace_root: &Path,
    ) -> Result<Self> {
        let workspace = workspace_root.canonicalize()?;
        let manager = crate::sandbox::SandboxManager::for_agent_command(
            workspace.clone(),
            crate::sandbox::NetworkPolicy::Deny,
        )?;
        let server_args: Vec<String> = server_args.iter().map(|arg| (*arg).to_string()).collect();
        let command = crate::sandbox::background_command(
            Some(&manager),
            crate::sandbox::Invocation::Program {
                program: server_cmd,
                args: &server_args,
            },
            &workspace,
            None,
        )?;
        let mut cmd = Command::from(command);
        cmd.stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            // This client never reads stderr. Inheriting a pipe lets a noisy
            // server fill it and deadlock the turn.
            .stderr(std::process::Stdio::null());
        let mut child = crate::process_tree::ProcessTreeChild::spawn(cmd)
            .with_context(|| format!("spawn {server_cmd}"))?;
        let stdin = child.child_mut().stdin.take().context("stdin")?;
        let stdout = child.child_mut().stdout.take().context("stdout")?;
        let mut client = Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            next_id: AtomicI64::new(2),
            diagnostics_buffer: DiagnosticsBuffer::new(),
        };
        let params = serde_json::json!({
            "processId": std::process::id(),
            "rootUri": path_to_file_uri(workspace_root),
            "capabilities": {},
        });
        tokio::time::timeout(LSP_REQUEST_TIMEOUT, client.call(1, "initialize", params))
            .await
            .map_err(|_| anyhow::anyhow!("LSP initialize timed out"))?
            .context("LSP initialize failed")?;
        client.notify("initialized", serde_json::json!({})).await?;
        Ok(client)
    }

    pub async fn request(&mut self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        tokio::time::timeout(LSP_REQUEST_TIMEOUT, self.call(id, method, params))
            .await
            .map_err(|_| anyhow::anyhow!("LSP request `{method}` timed out"))?
    }

    pub async fn notify(&mut self, method: &str, params: Value) -> Result<()> {
        self.send(&serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }))
        .await
    }

    pub async fn open_document(&mut self, uri: &str, language_id: &str, text: &str) -> Result<()> {
        self.notify(
            "textDocument/didOpen",
            serde_json::json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": language_id,
                    "version": 1,
                    "text": text,
                },
            }),
        )
        .await
    }

    async fn call(&mut self, id: i64, method: &str, params: Value) -> Result<Value> {
        self.send(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        }))
        .await?;
        for _ in 0..MAX_FRAMES {
            let frame = self.read_frame().await?.with_context(|| {
                format!("LSP server closed stdout before responding to id {id}")
            })?;
            if let Some(outcome) = response_for(&frame, id) {
                return outcome;
            }
            self.decline_server_request(&frame).await?;
        }
        anyhow::bail!("LSP server produced no response matching id {id} within {MAX_FRAMES} frames")
    }

    async fn decline_server_request(&mut self, frame: &Value) -> Result<()> {
        let (Some(id), Some(method)) =
            (frame.get("id"), frame.get("method").and_then(Value::as_str))
        else {
            return Ok(());
        };
        self.send(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {"code": -32601, "message": format!("{method} is not supported by this client")},
        }))
        .await
    }

    async fn send(&mut self, message: &Value) -> Result<()> {
        let body = serde_json::to_string(message)?;
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        self.stdin.write_all(header.as_bytes()).await?;
        self.stdin.write_all(body.as_bytes()).await?;
        self.stdin.flush().await?;
        Ok(())
    }

    async fn read_frame(&mut self) -> Result<Option<Value>> {
        let mut header_line = String::new();
        let mut content_length: usize = 0;
        loop {
            header_line.clear();
            if self.stdout.read_line(&mut header_line).await? == 0 {
                return Ok(None);
            }
            if header_line.trim().is_empty() {
                break;
            }
            if let Some(rest) = header_line.strip_prefix("Content-Length: ") {
                content_length = rest
                    .trim()
                    .parse()
                    .context("invalid LSP Content-Length header")?;
            }
        }
        if content_length > MAX_CONTENT_LENGTH {
            anyhow::bail!(
                "LSP Content-Length {content_length} exceeds maximum {MAX_CONTENT_LENGTH} bytes"
            );
        }
        let mut buf = vec![0u8; content_length];
        self.stdout.read_exact(&mut buf).await?;
        Ok(Some(serde_json::from_slice(&buf)?))
    }

    pub async fn shutdown(mut self) -> Result<()> {
        let _ =
            tokio::time::timeout(LSP_SHUTDOWN_GRACE, self.request("shutdown", Value::Null)).await;
        self.child.terminate().await;
        Ok(())
    }

    pub async fn completion(&mut self, file: &str, line: u32, character: u32) -> Result<Value> {
        let uri = path_to_file_uri(Path::new(file));
        let params = serde_json::json!({
            "textDocument": {"uri": uri},
            "position": {"line": line, "character": character},
        });
        self.request("textDocument/completion", params).await
    }

    pub async fn document_symbol(&mut self, file: &str) -> Result<Value> {
        let uri = path_to_file_uri(Path::new(file));
        let params = serde_json::json!({"textDocument": {"uri": uri}});
        self.request("textDocument/documentSymbol", params).await
    }

    pub async fn formatting(&mut self, file: &str, tab_size: u32) -> Result<Value> {
        let uri = path_to_file_uri(Path::new(file));
        let params = serde_json::json!({
            "textDocument": {"uri": uri},
            "options": {"tabSize": tab_size, "insertSpaces": true}
        });
        self.request("textDocument/formatting", params).await
    }

    // Diagnostics are server-pushed (textDocument/publishDiagnostics). The
    // request() method blocks on the next Content-Length frame, interleaved
    // notifications would deadlock. A real push-diagnostics loop requires a
    // separate concurrent reader task (M-future). For now, expose the empty
    // buffer so the lsp_diagnostics tool compiles and returns a useful hint.
    pub fn diagnostics(&self) -> Vec<Diagnostic> {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    use super::LSP_REQUEST_TIMEOUT;
    use super::{path_to_file_uri, response_for, LspClient};
    use serde_json::json;
    use std::path::Path;

    #[test]
    fn a_relative_path_never_becomes_the_uri_host() {
        assert_eq!(
            path_to_file_uri(Path::new("src/main.rs")),
            "file:///src/main.rs"
        );
    }

    #[test]
    fn an_error_frame_is_an_error_not_an_empty_answer() {
        let frame = json!({
            "jsonrpc": "2.0",
            "id": 2,
            "error": {"code": -32601, "message": "Unhandled method textDocument/formatting"}
        });

        let error = response_for(&frame, 2)
            .expect("the frame answers id 2")
            .expect_err("an error frame must not become Ok(null)");

        assert!(error.to_string().contains("-32601"), "{error}");
        assert!(
            error
                .to_string()
                .contains("Unhandled method textDocument/formatting"),
            "{error}"
        );
    }

    #[test]
    fn response_frames_are_told_apart_from_everything_else() {
        assert_eq!(
            response_for(&json!({"id": 2, "result": null}), 2)
                .expect("answers id 2")
                .expect("an explicit null result is a valid empty answer"),
            json!(null)
        );
        assert_eq!(
            response_for(&json!({"id": 2, "result": [{"uri": "file:///a.rs"}]}), 2)
                .expect("answers id 2")
                .expect("result"),
            json!([{"uri": "file:///a.rs"}])
        );
        assert!(response_for(
            &json!({"id": 2, "result": [], "error": {"code": -32603, "message": "x"}}),
            2
        )
        .expect("answers id 2")
        .is_err());
        assert!(response_for(&json!({"id": 2}), 2)
            .expect("answers id 2")
            .is_err());
        assert!(response_for(&json!({"id": 2, "method": "workspace/configuration"}), 2).is_none());
        assert!(response_for(&json!({"method": "window/logMessage"}), 2).is_none());
        assert!(response_for(&json!({"id": 1, "result": {}}), 2).is_none());
    }

    #[cfg(not(windows))]
    const FAKE_SERVER: &str = r#"
import json
import sys

MODE = sys.argv[1] if len(sys.argv) > 1 else "ok"

def read_frame():
    length = 0
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            sys.exit(0)
        line = line.decode().strip()
        if not line:
            break
        if line.lower().startswith("content-length:"):
            length = int(line.split(":", 1)[1])
    return json.loads(sys.stdin.buffer.read(length))

def write_frame(frame):
    body = json.dumps(frame).encode()
    sys.stdout.buffer.write(b"Content-Length: %d\r\n\r\n" % len(body) + body)
    sys.stdout.buffer.flush()

seen = []
initialize = read_frame()
seen.append(initialize["method"])
write_frame({"jsonrpc": "2.0", "id": initialize["id"], "result": {"capabilities": {}}})
write_frame({"jsonrpc": "2.0", "method": "window/logMessage", "params": {"type": 3, "message": "ready"}})
opened = None
while True:
    frame = read_frame()
    seen.append(frame.get("method"))
    if frame.get("method") == "textDocument/didOpen":
        opened = frame["params"]["textDocument"]["uri"]
    if "id" in frame:
        break
request = frame
write_frame({"jsonrpc": "2.0", "id": request["id"], "method": "workspace/configuration", "params": {"items": []}})
declined = read_frame()
if MODE == "error":
    write_frame({"jsonrpc": "2.0", "id": request["id"], "error": {"code": -32601, "message": "Unhandled method " + request["method"]}})
else:
    write_frame({"jsonrpc": "2.0", "id": request["id"], "result": {"seen": seen, "opened": opened, "declined": declined.get("error", {}).get("code")}})
while True:
    frame = read_frame()
    if frame.get("method") == "shutdown":
        write_frame({"jsonrpc": "2.0", "id": frame["id"], "result": None})
"#;

    #[cfg(not(windows))]
    fn python3_available() -> bool {
        std::process::Command::new("python3")
            .arg("-I")
            .arg("-S")
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    #[cfg(windows)]
    async fn assert_windows_lsp_refusal() {
        use crate::native_process_test_fixture::{
            assert_windows_backend_refusal, windows_refusal_probe, Input, NativeProcessFixture,
        };

        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let fixture = NativeProcessFixture::new();
        fixture
            .scope(async {
                let workspace = tempfile::tempdir().expect("Windows LSP refusal workspace");
                let root = workspace.path().canonicalize().unwrap();
                let probe = windows_refusal_probe(&root, LSP_REQUEST_TIMEOUT).await;
                let args: Vec<&str> = probe.args.iter().map(String::as_str).collect();
                let error = LspClient::spawn("cmd.exe", &args, &root)
                    .await
                    .err()
                    .expect("Windows unavailable backend must refuse server startup");
                assert_windows_backend_refusal(&error.to_string());
                probe.assert_marker_absent();
            })
            .await;
        fixture.assert_inputs(&[Input::DeviceIdentity]);
    }

    #[tokio::test]
    async fn language_server_cannot_write_outside_its_workspace() {
        #[cfg(windows)]
        {
            assert_windows_lsp_refusal().await;
        }
        #[cfg(not(windows))]
        {
            use crate::native_process_test_fixture::{Input, NativeProcessFixture};

            let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
            NativeProcessFixture::require_backend();
            assert!(
                python3_available(),
                "python3 required for this native regression"
            );
            let fixture = NativeProcessFixture::new();
            fixture
            .scope(async {
                assert!(
                    python3_available(),
                    "python3 is required for this isolation regression"
                );
                let workspace = tempfile::tempdir().unwrap();
                let private = tempfile::tempdir().unwrap();
                let marker = private.path().join("server-wrote-outside");
                let marker_literal = serde_json::to_string(&marker.to_string_lossy()).unwrap();
                let script = format!(
                    "from pathlib import Path\ntry:\n Path({marker_literal}).write_text('controlled fixture')\nexcept OSError:\n pass\n{FAKE_SERVER}"
                );
                let client = LspClient::spawn("python3", &["-I", "-S", "-u", "-c", &script, "ok"], workspace.path())
                    .await
                    .unwrap();
                client.shutdown().await.unwrap();
                assert!(
                    !marker.exists(),
                    "language server wrote outside its workspace"
                );
            })
            .await;
            fixture.assert_inputs(&[Input::DeviceIdentity, Input::ManagedSettings]);
        }
    }

    #[tokio::test]
    async fn a_request_follows_the_handshake_and_the_opened_document() {
        #[cfg(windows)]
        {
            assert_windows_lsp_refusal().await;
        }
        #[cfg(not(windows))]
        {
            use crate::native_process_test_fixture::{Input, NativeProcessFixture};

            let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
            NativeProcessFixture::require_backend();
            assert!(
                python3_available(),
                "python3 required for this native regression"
            );
            let fixture = NativeProcessFixture::new();
            fixture
                .scope(async {
                    let root = tempfile::tempdir().expect("workspace");
                    let mut client = LspClient::spawn(
                        "python3",
                        &["-I", "-S", "-u", "-c", FAKE_SERVER, "ok"],
                        root.path(),
                    )
                    .await
                    .expect("initialize handshake");

                    client
                        .open_document("file:///workspace/main.rs", "rust", "fn main() {}\n")
                        .await
                        .expect("didOpen");
                    let answer = client
                        .request("textDocument/hover", json!({}))
                        .await
                        .expect("hover");

                    assert_eq!(
                        answer["seen"],
                        json!([
                            "initialize",
                            "initialized",
                            "textDocument/didOpen",
                            "textDocument/hover"
                        ])
                    );
                    assert_eq!(answer["opened"], json!("file:///workspace/main.rs"));
                    assert_eq!(answer["declined"], json!(-32601));
                    client.shutdown().await.expect("shutdown");
                })
                .await;
            fixture.assert_inputs(&[Input::DeviceIdentity, Input::ManagedSettings]);
        }
    }

    #[tokio::test]
    async fn a_language_server_error_reaches_the_caller() {
        #[cfg(windows)]
        {
            assert_windows_lsp_refusal().await;
        }
        #[cfg(not(windows))]
        {
            use crate::native_process_test_fixture::{Input, NativeProcessFixture};

            let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
            NativeProcessFixture::require_backend();
            assert!(
                python3_available(),
                "python3 required for this native regression"
            );
            let fixture = NativeProcessFixture::new();
            fixture
                .scope(async {
                    let root = tempfile::tempdir().expect("workspace");
                    let mut client = LspClient::spawn(
                        "python3",
                        &["-I", "-S", "-u", "-c", FAKE_SERVER, "error"],
                        root.path(),
                    )
                    .await
                    .expect("initialize handshake");

                    let error = client
                        .request("textDocument/formatting", json!({}))
                        .await
                        .expect_err("an error response must not read as an empty answer");

                    assert!(error.to_string().contains("-32601"), "{error}");
                    client.shutdown().await.expect("shutdown");
                })
                .await;
            fixture.assert_inputs(&[Input::DeviceIdentity, Input::ManagedSettings]);
        }
    }

    #[test]
    fn encodes_spaces_and_reserved_chars_in_segments() {
        let uri = path_to_file_uri(Path::new("/home/user/my file#1?.rs"));
        assert_eq!(uri, "file:///home/user/my%20file%231%3F.rs");
    }

    #[test]
    fn preserves_path_separators() {
        let uri = path_to_file_uri(Path::new("/a/b/c.rs"));
        assert_eq!(uri, "file:///a/b/c.rs");
    }

    #[test]
    fn handles_windows_drive_and_backslashes() {
        let uri = path_to_file_uri(Path::new(r"C:\Users\me\my file.rs"));
        assert_eq!(uri, "file:///C:/Users/me/my%20file.rs");
    }

    #[test]
    fn plain_ascii_path_is_unchanged() {
        let uri = path_to_file_uri(Path::new("/tmp/main.rs"));
        assert_eq!(uri, "file:///tmp/main.rs");
    }
}
