//! Idle watchdog for provider streams.
//!
//! Providers occasionally stall mid-stream without closing the connection.
//! Every dialect runner pulls chunks through [`IdleWatchdog::next_item`],
//! which converts a silent stall into a structured
//! [`LlmError::IdleTimeout`]. The timeout is per-chunk (time since the last
//! byte), not per-request, and is parameterized so surfaces can choose their
//! own budget (CLI: 300s; desktop: 30s per the extraction plan).

use std::time::Duration;

use futures_util::{Stream, StreamExt};

use crate::error::LlmError;

#[derive(Debug, Clone, Copy)]
pub struct IdleWatchdog {
    timeout: Duration,
}

impl IdleWatchdog {
    pub fn new(timeout: Duration) -> Self {
        Self { timeout }
    }

    pub fn timeout(&self) -> Duration {
        self.timeout
    }

    /// Wait for the next stream item, failing with [`LlmError::IdleTimeout`]
    /// if nothing arrives within the configured window. `Ok(None)` is a clean
    /// end-of-stream.
    pub async fn next_item<S>(&self, stream: &mut S) -> Result<Option<S::Item>, LlmError>
    where
        S: Stream + Unpin,
    {
        match tokio::time::timeout(self.timeout, stream.next()).await {
            Err(_) => Err(LlmError::IdleTimeout {
                after: self.timeout,
            }),
            Ok(item) => Ok(item),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn fires_on_stalled_stream() {
        let mut stream =
            Box::pin(futures_util::stream::pending::<Result<bytes::Bytes, LlmError>>());
        let watchdog = IdleWatchdog::new(Duration::from_millis(50));
        let result = watchdog.next_item(&mut stream).await;
        assert!(matches!(result, Err(LlmError::IdleTimeout { .. })));
    }

    #[tokio::test]
    async fn passes_through_data_and_end_of_stream() {
        let watchdog = IdleWatchdog::new(Duration::from_millis(500));
        let mut stream = Box::pin(futures_util::stream::once(async {
            Ok::<_, LlmError>(bytes::Bytes::from("data: {}\n\n"))
        }));
        let first = watchdog.next_item(&mut stream).await.unwrap();
        assert!(first.is_some(), "data should arrive before the deadline");
        let end = watchdog.next_item(&mut stream).await.unwrap();
        assert!(end.is_none(), "stream end must be Ok(None), not a timeout");
    }
}
