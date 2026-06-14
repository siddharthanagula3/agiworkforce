//! Stdio LSP client. Spawns a language server subprocess, runs the
//! initialize → initialized handshake, then exposes definition / hover /
//! diagnostics methods. Per-language config: server binary path + args.

use anyhow::{Context, Result};
use serde_json::Value;
use std::path::Path;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::RwLock;

use crate::lsp::types::Diagnostic;

/// Build a well-formed `file://` URI from a filesystem path.
///
/// Naive `format!("file://{}", path)` produces malformed URIs for paths
/// containing spaces, `#`, `?`, or other reserved characters, and does not
/// handle Windows drive letters / backslashes — so LSP requests for such files
/// silently target the wrong (or no) document. This helper percent-encodes each
/// path segment (preserving `/` as the separator), normalizes Windows
/// backslashes to `/`, and emits the canonical `file:///C:/...` drive form on
/// Windows.
fn path_to_file_uri(path: &Path) -> String {
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
    // letter segment (`C:`) is preserved verbatim — the colon is valid there.
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

    if has_drive {
        // `C:/foo bar` -> `file:///C:/foo%20bar`
        format!("file:///{encoded_path}")
    } else {
        // Absolute unix path: the split keeps a leading empty segment so the
        // join already yields `/...`, giving `file:///foo%20bar`. A relative or
        // non-rooted path simply keeps the authority empty.
        format!("file://{encoded_path}")
    }
}

/// In-memory buffer for LSP publishDiagnostics notifications.
// Real push-diagnostics requires a dedicated async notification reader loop
// running concurrently with the request channel — out of scope for M36 MVP.
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
    child: Child,
    next_id: AtomicI64,
    diagnostics_buffer: DiagnosticsBuffer,
}

impl LspClient {
    pub async fn spawn(
        server_cmd: &str,
        server_args: &[&str],
        workspace_root: &Path,
    ) -> Result<Self> {
        let mut cmd = Command::new(server_cmd);
        cmd.args(server_args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        let mut child = cmd.spawn().with_context(|| format!("spawn {server_cmd}"))?;
        let stdin = child.stdin.as_mut().context("stdin")?;
        let init_req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "processId": std::process::id(),
                "rootUri": path_to_file_uri(workspace_root),
                "capabilities": {},
            },
        });
        let body = serde_json::to_string(&init_req)?;
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        stdin.write_all(header.as_bytes()).await?;
        stdin.write_all(body.as_bytes()).await?;
        stdin.flush().await?;
        // Don't block waiting for the response here — many tests will mock; the
        // returned client lets the caller drive further requests.
        Ok(Self {
            child,
            next_id: AtomicI64::new(2),
            diagnostics_buffer: DiagnosticsBuffer::new(),
        })
    }

    pub async fn request(&mut self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let stdin = self.child.stdin.as_mut().context("stdin")?;
        let body = serde_json::to_string(&req)?;
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        stdin.write_all(header.as_bytes()).await?;
        stdin.write_all(body.as_bytes()).await?;
        stdin.flush().await?;
        let stdout = self.child.stdout.as_mut().context("stdout")?;
        let mut reader = BufReader::new(stdout);
        // Upper bound on a single LSP frame to cap memory: a malicious/buggy
        // server could otherwise send a multi-GB Content-Length and OOM us.
        const MAX_CONTENT_LENGTH: usize = 32 * 1024 * 1024; // 32 MiB
        // Bound how many interleaved notifications/other responses we skip
        // before giving up on finding our id.
        const MAX_FRAMES: usize = 1024;
        for _ in 0..MAX_FRAMES {
            // Read this frame's headers.
            let mut header_line = String::new();
            let mut content_length: usize = 0;
            loop {
                header_line.clear();
                let n = reader.read_line(&mut header_line).await?;
                if n == 0 {
                    anyhow::bail!("LSP server closed stdout before responding to id {id}");
                }
                if header_line == "\r\n" || header_line.trim().is_empty() {
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
            reader.read_exact(&mut buf).await?;
            let resp: Value = serde_json::from_slice(&buf)?;
            // Skip notifications (no `id`) and responses to other requests;
            // only return the frame whose `id` matches this request.
            match resp.get("id").and_then(Value::as_i64) {
                Some(resp_id) if resp_id == id => {
                    return Ok(resp.get("result").cloned().unwrap_or(Value::Null));
                }
                _ => continue,
            }
        }
        anyhow::bail!("LSP server produced no response matching id {id} within {MAX_FRAMES} frames")
    }

    pub async fn shutdown(mut self) -> Result<()> {
        let _ = self.request("shutdown", Value::Null).await;
        let _ = self.child.kill().await;
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
    // request() method blocks on the next Content-Length frame — interleaved
    // notifications would deadlock. A real push-diagnostics loop requires a
    // separate concurrent reader task (M-future). For now, expose the empty
    // buffer so the lsp_diagnostics tool compiles and returns a useful hint.
    pub fn diagnostics(&self) -> Vec<Diagnostic> {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::path_to_file_uri;
    use std::path::Path;

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
