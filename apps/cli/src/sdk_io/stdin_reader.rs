//! Async line reader for embedder-supplied input over stdin.
//!
//! When `--input-format stream-json` is active each line on stdin is one
//! [`SdkInputMessage`] envelope. This reader handles framing (split on '\n'),
//! strips empty lines, ignores the keep-alive heartbeat, and surfaces parse
//! errors as [`SdkInputReaderError::Parse`] so the caller can decide whether
//! to drop the line and continue or terminate the session.

use std::io;

use tokio::io::{AsyncBufRead, AsyncBufReadExt, BufReader};

use super::protocol::SdkInputMessage;

#[derive(Debug)]
pub(crate) enum SdkInputReaderError {
    /// Embedder sent an unparseable line. Includes the raw line for logging.
    Parse {
        raw: String,
        error: serde_json::Error,
    },
    /// Underlying I/O failure. Stdin was closed or a transport error.
    Io(io::Error),
}

impl std::fmt::Display for SdkInputReaderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Parse { error, .. } => write!(f, "stream-json parse error: {error}"),
            Self::Io(e) => write!(f, "stream-json io error: {e}"),
        }
    }
}

impl std::error::Error for SdkInputReaderError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Parse { error, .. } => Some(error),
            Self::Io(e) => Some(e),
        }
    }
}

/// Reader over any [`AsyncBufRead`]. The default constructor wraps tokio's
/// stdin; tests inject an in-memory buffer.
pub(crate) struct StdinReader<R: AsyncBufRead + Unpin> {
    inner: R,
    buf: String,
}

impl StdinReader<BufReader<tokio::io::Stdin>> {
    pub(crate) fn from_stdin() -> Self {
        Self::new(BufReader::new(tokio::io::stdin()))
    }
}

impl<R: AsyncBufRead + Unpin> StdinReader<R> {
    pub(crate) fn new(inner: R) -> Self {
        Self {
            inner,
            buf: String::new(),
        }
    }

    /// Read the next message envelope. Returns `Ok(None)` on EOF.
    /// Empty lines and `KeepAlive` heartbeats are filtered transparently.
    pub(crate) async fn next_message(
        &mut self,
    ) -> Result<Option<SdkInputMessage>, SdkInputReaderError> {
        loop {
            self.buf.clear();
            let n = self
                .inner
                .read_line(&mut self.buf)
                .await
                .map_err(SdkInputReaderError::Io)?;
            if n == 0 {
                return Ok(None);
            }
            let line = self.buf.trim();
            if line.is_empty() {
                continue;
            }
            match serde_json::from_str::<SdkInputMessage>(line) {
                Ok(SdkInputMessage::KeepAlive) => continue,
                Ok(msg) => return Ok(Some(msg)),
                Err(error) => {
                    return Err(SdkInputReaderError::Parse {
                        raw: line.to_string(),
                        error,
                    });
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::BufReader;

    fn reader_for(input: &str) -> StdinReader<BufReader<&[u8]>> {
        StdinReader::new(BufReader::new(input.as_bytes()))
    }

    #[tokio::test]
    async fn parses_user_message() {
        let payload = format!(
            "{}\n",
            r#"{"type":"user","session_id":"s1","message":{"role":"user","content":"hi"}}"#
        );
        let mut r = reader_for(&payload);
        let msg = r.next_message().await.unwrap().unwrap();
        match msg {
            SdkInputMessage::User(u) => {
                assert_eq!(u.session_id, "s1");
                assert_eq!(u.message.role, "user");
            }
            other => panic!("expected User, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn skips_blank_lines_and_keepalives() {
        let payload = "\n\n{\"type\":\"keep_alive\"}\n\n{\"type\":\"interrupt\"}\n";
        let mut r = reader_for(payload);
        let msg = r.next_message().await.unwrap().unwrap();
        assert!(matches!(msg, SdkInputMessage::Interrupt { .. }));
    }

    #[tokio::test]
    async fn returns_none_on_eof() {
        let mut r = reader_for("");
        assert!(r.next_message().await.unwrap().is_none());
    }

    #[tokio::test]
    async fn parse_error_surfaces_raw_line() {
        let mut r = reader_for("{not json\n");
        match r.next_message().await {
            Err(SdkInputReaderError::Parse { raw, .. }) => assert_eq!(raw, "{not json"),
            other => panic!("expected parse error, got {other:?}"),
        }
    }
}
