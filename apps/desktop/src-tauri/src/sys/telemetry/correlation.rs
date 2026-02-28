//! Correlation ID support for request tracing
//!
//! This module provides correlation IDs that can be attached to requests
//! and propagated through the system for distributed tracing and debugging.

use std::cell::RefCell;
use uuid::Uuid;

thread_local! {
    /// Current correlation ID for this thread
    static CURRENT_CORRELATION_ID: RefCell<Option<String>> = const { RefCell::new(None) };
}

/// A guard that sets a correlation ID for the duration of its lifetime
pub struct CorrelationGuard {
    previous: Option<String>,
}

impl CorrelationGuard {
    /// Create a new correlation guard with a random ID
    pub fn new() -> Self {
        Self::with_id(Uuid::new_v4().to_string())
    }

    /// Create a new correlation guard with a specific ID
    pub fn with_id(id: impl Into<String>) -> Self {
        let id = id.into();
        let previous = CURRENT_CORRELATION_ID.with(|cell| {
            let mut borrowed = cell.borrow_mut();
            let previous = borrowed.take();
            *borrowed = Some(id);
            previous
        });
        Self { previous }
    }
}

impl Default for CorrelationGuard {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for CorrelationGuard {
    fn drop(&mut self) {
        CURRENT_CORRELATION_ID.with(|cell| {
            *cell.borrow_mut() = self.previous.take();
        });
    }
}

/// Get the current correlation ID, if any
pub fn current_correlation_id() -> Option<String> {
    CURRENT_CORRELATION_ID.with(|cell| cell.borrow().clone())
}

/// Generate a new correlation ID
pub fn generate_correlation_id() -> String {
    Uuid::new_v4().to_string()
}

/// Execute a closure with a correlation ID set
pub fn with_correlation_id<T, F>(id: impl Into<String>, f: F) -> T
where
    F: FnOnce() -> T,
{
    let _guard = CorrelationGuard::with_id(id);
    f()
}

/// Execute a closure with a new random correlation ID
pub fn with_new_correlation_id<T, F>(f: F) -> (String, T)
where
    F: FnOnce() -> T,
{
    let id = generate_correlation_id();
    let guard = CorrelationGuard::with_id(id.clone());
    let result = f();
    drop(guard);
    (id, result)
}

/// Macro to create a tracing span with correlation ID
#[macro_export]
macro_rules! span_with_correlation {
    ($level:expr, $name:expr) => {{
        let correlation_id = $crate::sys::telemetry::correlation::current_correlation_id()
            .unwrap_or_else(|| "none".to_string());
        tracing::span!($level, $name, correlation_id = %correlation_id)
    }};
    ($level:expr, $name:expr, $($field:tt)*) => {{
        let correlation_id = $crate::sys::telemetry::correlation::current_correlation_id()
            .unwrap_or_else(|| "none".to_string());
        tracing::span!($level, $name, correlation_id = %correlation_id, $($field)*)
    }};
}

/// Macro to log with correlation ID included
#[macro_export]
macro_rules! log_with_correlation {
    ($level:ident, $($arg:tt)*) => {{
        let correlation_id = $crate::sys::telemetry::correlation::current_correlation_id()
            .unwrap_or_else(|| "none".to_string());
        tracing::$level!(correlation_id = %correlation_id, $($arg)*);
    }};
}

/// A request context that carries correlation ID and other metadata
#[derive(Debug, Clone)]
pub struct RequestContext {
    /// Unique identifier for this request chain
    pub correlation_id: String,
    /// Optional user ID for the request
    pub user_id: Option<String>,
    /// Optional session ID
    pub session_id: Option<String>,
    /// Request start time
    pub start_time: std::time::Instant,
}

impl RequestContext {
    /// Create a new request context with a random correlation ID
    pub fn new() -> Self {
        Self {
            correlation_id: generate_correlation_id(),
            user_id: None,
            session_id: None,
            start_time: std::time::Instant::now(),
        }
    }

    /// Create a context with a specific correlation ID
    pub fn with_correlation_id(id: impl Into<String>) -> Self {
        Self {
            correlation_id: id.into(),
            user_id: None,
            session_id: None,
            start_time: std::time::Instant::now(),
        }
    }

    /// Set the user ID
    pub fn with_user(mut self, user_id: impl Into<String>) -> Self {
        self.user_id = Some(user_id.into());
        self
    }

    /// Set the session ID
    pub fn with_session(mut self, session_id: impl Into<String>) -> Self {
        self.session_id = Some(session_id.into());
        self
    }

    /// Get the elapsed time since the request started
    pub fn elapsed(&self) -> std::time::Duration {
        self.start_time.elapsed()
    }

    /// Create a tracing span for this context
    pub fn span(&self, name: &'static str) -> tracing::Span {
        if let Some(ref user_id) = self.user_id {
            tracing::info_span!(
                "request",
                name = name,
                correlation_id = %self.correlation_id,
                user_id = %user_id,
            )
        } else {
            tracing::info_span!(
                "request",
                name = name,
                correlation_id = %self.correlation_id,
            )
        }
    }

    /// Log completion of the request
    pub fn log_completion(&self, success: bool) {
        let duration_ms = self.elapsed().as_millis();

        if success {
            tracing::info!(
                correlation_id = %self.correlation_id,
                duration_ms = duration_ms,
                "Request completed successfully"
            );
        } else {
            tracing::warn!(
                correlation_id = %self.correlation_id,
                duration_ms = duration_ms,
                "Request failed"
            );
        }
    }
}

impl Default for RequestContext {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_correlation_id_generation() {
        let id1 = generate_correlation_id();
        let id2 = generate_correlation_id();

        assert_ne!(id1, id2);
        assert!(!id1.is_empty());
        assert!(!id2.is_empty());
    }

    #[test]
    fn test_correlation_guard() {
        assert!(current_correlation_id().is_none());

        {
            let _guard = CorrelationGuard::with_id("test-id-1");
            assert_eq!(current_correlation_id(), Some("test-id-1".to_string()));

            {
                let _inner_guard = CorrelationGuard::with_id("test-id-2");
                assert_eq!(current_correlation_id(), Some("test-id-2".to_string()));
            }

            // Should restore previous
            assert_eq!(current_correlation_id(), Some("test-id-1".to_string()));
        }

        // Should be None again
        assert!(current_correlation_id().is_none());
    }

    #[test]
    fn test_with_correlation_id() {
        let result = with_correlation_id("my-test-id", current_correlation_id);

        assert_eq!(result, Some("my-test-id".to_string()));
        assert!(current_correlation_id().is_none());
    }

    #[test]
    fn test_with_new_correlation_id() {
        let (id, inner_id) = with_new_correlation_id(current_correlation_id);

        assert_eq!(inner_id, Some(id.clone()));
        assert!(current_correlation_id().is_none());
    }

    #[test]
    fn test_request_context() {
        let ctx = RequestContext::new()
            .with_user("user-123")
            .with_session("session-456");

        assert!(ctx.user_id.is_some());
        assert!(ctx.session_id.is_some());
        assert!(!ctx.correlation_id.is_empty());
    }

    #[test]
    fn test_request_context_elapsed() {
        let ctx = RequestContext::new();
        std::thread::sleep(std::time::Duration::from_millis(10));
        assert!(ctx.elapsed().as_millis() >= 10);
    }
}
