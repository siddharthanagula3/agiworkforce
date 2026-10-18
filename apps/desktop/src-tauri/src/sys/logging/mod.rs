/// Compiled once. `filter_sensitive_data` is called for every field of every
/// record a support bundle carries (up to
/// `crate::sys::support_bundle::MAX_BUNDLE_LINES` records), so recompiling
/// these on each call is thousands of regex builds per bundle.
///
/// The patterns are literals, so a compile failure is a bug in this file, not a
/// runtime condition, panic rather than silently shipping a redactor that skips
/// a rule.
static SENSITIVE_PATTERNS: once_cell::sync::Lazy<Vec<(regex::Regex, &'static str)>> =
    once_cell::sync::Lazy::new(|| {
        raw_sensitive_patterns()
            .into_iter()
            .map(|(pattern, replacement)| {
                let compiled = regex::Regex::new(pattern)
                    .unwrap_or_else(|e| panic!("invalid redaction pattern {pattern:?}: {e}"));
                (compiled, replacement)
            })
            .collect()
    });

fn raw_sensitive_patterns() -> Vec<(&'static str, &'static str)> {
    vec![
        (
            r#"(?i)(api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_-]+)['"]?"#,
            "API_KEY=***",
        ),
        (
            r#"(?i)(password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"]+)['"]?"#,
            "PASSWORD=***",
        ),
        (
            r#"(?i)(token|auth[_-]?token)\s*[:=]\s*['"]?([a-zA-Z0-9._-]+)['"]?"#,
            "TOKEN=***",
        ),
        (
            r#"(?i)(secret|client[_-]?secret)\s*[:=]\s*['"]?([a-zA-Z0-9_-]+)['"]?"#,
            "SECRET=***",
        ),
        (
            r#"(?i)(bearer|authorization)\s*[:=]?\s*(?:bearer\s+)?['"]?([a-zA-Z0-9._-]+)['"]?"#,
            "BEARER=***",
        ),
        (
            r#"(?i)(private[_-]?key)\s*[:=]\s*['"]?([^\s'"]+)['"]?"#,
            "PRIVATE_KEY=***",
        ),
        // Match URI credentials: protocol://user:password@host
        (
            r#"(?i)([a-z]+://)([^:@\s]+):([^@\s]+)@([a-z0-9.-]+)"#,
            "${1}${2}:***@${4}",
        ),
    ]
}

pub fn filter_sensitive_data(input: &str) -> String {
    let mut filtered = input.to_string();

    for (pattern, replacement) in SENSITIVE_PATTERNS.iter() {
        filtered = pattern.replace_all(&filtered, *replacement).to_string();
    }

    filtered
}

pub struct PerformanceMetrics {
    pub operation: String,
    pub duration_ms: u64,
    pub memory_used_bytes: Option<u64>,
    pub success: bool,
}

impl PerformanceMetrics {
    pub fn log(&self) {
        if self.success {
            tracing::info!(
                operation = %self.operation,
                duration_ms = self.duration_ms,
                memory_used_bytes = ?self.memory_used_bytes,
                "Operation completed successfully"
            );
        } else {
            tracing::warn!(
                operation = %self.operation,
                duration_ms = self.duration_ms,
                "Operation failed"
            );
        }
    }
}

#[macro_export]
macro_rules! log_safe {
    ($level:expr, $($arg:tt)*) => {
        {
            let message = format!($($arg)*);
            let filtered = $crate::sys::logging::filter_sensitive_data(&message);
            match $level {
                tracing::Level::TRACE => tracing::trace!("{}", filtered),
                tracing::Level::DEBUG => tracing::debug!("{}", filtered),
                tracing::Level::INFO => tracing::info!("{}", filtered),
                tracing::Level::WARN => tracing::warn!("{}", filtered),
                tracing::Level::ERROR => tracing::error!("{}", filtered),
            }
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_api_key() {
        let input = "api_key: sk-1234567890abcdef";
        let filtered = filter_sensitive_data(input);
        assert!(filtered.contains("API_KEY=***"));
        assert!(!filtered.contains("sk-1234567890abcdef"));
    }

    #[test]
    fn test_filter_password() {
        let input = "password=MySecretPass123";
        let filtered = filter_sensitive_data(input);
        assert!(filtered.contains("PASSWORD=***"));
        assert!(!filtered.contains("MySecretPass123"));
    }

    #[test]
    fn test_filter_token() {
        let input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
        let filtered = filter_sensitive_data(input);
        assert!(filtered.contains("BEARER=***"));
        assert!(!filtered.contains("eyJhbGci"));
    }

    #[test]
    fn test_filter_multiple_secrets() {
        let input = "api_key=abc123 password=secret token=xyz789";
        let filtered = filter_sensitive_data(input);
        assert!(filtered.contains("API_KEY=***"));
        assert!(filtered.contains("PASSWORD=***"));
        assert!(filtered.contains("TOKEN=***"));
    }
    #[test]
    fn every_redaction_pattern_compiles() {
        assert_eq!(SENSITIVE_PATTERNS.len(), raw_sensitive_patterns().len());
    }

    #[test]
    fn test_filter_uri_credentials() {
        let input = "Connecting to postgres://user:password123@localhost:5432/mydb";
        let filtered = filter_sensitive_data(input);
        assert!(filtered.contains("postgres://user:***@localhost"));
        assert!(!filtered.contains("password123"));
    }
}
