//! NDJSON-safe writer.
//!
//! `serde_json::to_string` emits raw U+2028 (LINE SEPARATOR) and U+2029
//! (PARAGRAPH SEPARATOR) bytes when those characters appear inside a string.
//! Most NDJSON consumers split on '\n' and assume one JSON document per line,
//! but JavaScript's historical handling of `JSON.parse` permits U+2028/U+2029
//! inside source — and several streaming parsers (and a few terminal layers)
//! treat them as line breaks too. The result is silent corruption: a single
//! event splits across two lines and breaks the parser on the receiving side.
//!
//! We escape both to their `\uXXXX` form before writing. Same trick Claude
//! Code's `cli/ndjsonSafeStringify.ts` uses; trivial to re-implement.

use std::io::{self, Write};

use serde::Serialize;
use tokio::io::{AsyncWrite, AsyncWriteExt};
use tokio::sync::Mutex;

/// Escape U+2028 / U+2029 to their `\uXXXX` JSON forms.
fn escape_line_terminators(s: &str) -> String {
    if !s.contains('\u{2028}') && !s.contains('\u{2029}') {
        return s.to_string();
    }
    s.replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

/// Synchronous helper for tests and any caller that already has a `Write`.
pub(crate) fn write_event_sync<W: Write, T: Serialize>(w: &mut W, event: &T) -> io::Result<()> {
    let raw = serde_json::to_string(event)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
    let escaped = escape_line_terminators(&raw);
    w.write_all(escaped.as_bytes())?;
    w.write_all(b"\n")?;
    w.flush()
}

/// Async NDJSON writer wrapping any [`AsyncWrite`]. Holds a mutex so multiple
/// emitters (the agent loop, the control channel, status updates) can share
/// the same stdout without interleaving partial lines.
pub(crate) struct NdjsonWriter<W: AsyncWrite + Unpin> {
    inner: Mutex<W>,
}

impl<W: AsyncWrite + Unpin> NdjsonWriter<W> {
    pub(crate) fn new(w: W) -> Self {
        Self {
            inner: Mutex::new(w),
        }
    }

    /// Serialize and write one event followed by a newline. The whole payload
    /// goes out under a single mutex hold so two concurrent emitters can never
    /// produce a torn line.
    pub(crate) async fn emit<T: Serialize>(&self, event: &T) -> io::Result<()> {
        let raw = serde_json::to_string(event)
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
        let escaped = escape_line_terminators(&raw);
        let mut guard = self.inner.lock().await;
        guard.write_all(escaped.as_bytes()).await?;
        guard.write_all(b"\n").await?;
        guard.flush().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Serialize;

    #[derive(Serialize)]
    struct M {
        text: &'static str,
    }

    #[test]
    fn passthrough_when_no_separators() {
        let mut buf = Vec::new();
        write_event_sync(&mut buf, &M { text: "hello" }).unwrap();
        assert_eq!(buf, b"{\"text\":\"hello\"}\n");
    }

    #[test]
    fn escapes_u2028_and_u2029() {
        let mut buf = Vec::new();
        write_event_sync(
            &mut buf,
            &M {
                text: "a\u{2028}b\u{2029}c",
            },
        )
        .unwrap();
        let line = std::str::from_utf8(&buf).unwrap();
        assert!(line.contains("\\u2028"));
        assert!(line.contains("\\u2029"));
        assert!(!line.contains('\u{2028}'));
        assert!(!line.contains('\u{2029}'));
        assert!(line.ends_with('\n'));
    }

    #[test]
    fn one_trailing_newline_per_event() {
        let mut buf = Vec::new();
        write_event_sync(&mut buf, &M { text: "x" }).unwrap();
        write_event_sync(&mut buf, &M { text: "y" }).unwrap();
        assert_eq!(buf.iter().filter(|&&b| b == b'\n').count(), 2);
    }
}
