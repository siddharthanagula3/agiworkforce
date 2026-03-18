use regex::Regex;
use std::fmt;
use std::sync::LazyLock;
use std::time::Duration;

// ---------------------------------------------------------------------------
// Context overflow detection — 16 regex patterns covering every major provider
// ---------------------------------------------------------------------------

/// Compiled regex patterns that detect context/token overflow errors across
/// all major LLM providers. Each pattern is case-insensitive.
///
/// Sources (OpenCode research):
/// - Anthropic: "prompt is too long"
/// - AWS Bedrock: "input is too long"
/// - OpenAI: "exceeds the context window"
/// - Google Gemini: "input token count.*exceeds"
/// - xAI (Grok): "maximum prompt length"
/// - Groq: "reduce the length of the messages"
/// - OpenRouter / DeepSeek: "maximum context length is N tokens"
/// - GitHub Copilot: "exceeds the limit"
/// - llama.cpp: "exceeds the available context size"
/// - LM Studio: "greater than the context length"
/// - MiniMax: "context window exceeds limit"
/// - Kimi / Moonshot: "exceeded model token limit"
/// - Generic: "context.?length.?exceeded"
/// - HTTP 413: "request entity too large"
/// - Generic token patterns: "token limit exceeded", "too many tokens"
/// - Cohere: "total number of tokens.*exceeded"
static OVERFLOW_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    let patterns = [
        r"(?i)prompt is too long",
        r"(?i)input is too long",
        r"(?i)exceeds the context window",
        r"(?i)input token count.*exceeds",
        r"(?i)maximum prompt length",
        r"(?i)reduce the length of the messages",
        r"(?i)maximum context length is \d+ tokens",
        r"(?i)exceeds the limit",
        r"(?i)exceeds the available context size",
        r"(?i)greater than the context length",
        r"(?i)context window exceeds limit",
        r"(?i)exceeded model token limit",
        r"(?i)context.?length.?exceeded",
        r"(?i)request entity too large",
        r"(?i)token limit exceeded",
        r"(?i)too many tokens",
        r"(?i)total number of tokens.*exceeded",
    ];
    patterns
        .iter()
        .map(|p| Regex::new(p).expect("invalid overflow pattern regex"))
        .collect()
});

/// Returns `true` if `message` matches any known context-overflow error string
/// from the 17 provider-specific patterns compiled above.
#[allow(dead_code)]
pub fn detect_context_overflow(message: &str) -> bool {
    OVERFLOW_PATTERNS.iter().any(|pat| pat.is_match(message))
}

// ---------------------------------------------------------------------------
// Error enum
// ---------------------------------------------------------------------------

/// Structured error types for the CLI.
///
/// Replaces ad-hoc `anyhow::bail!` calls with typed, matchable errors that
/// carry enough context for user-friendly messages and retry logic.
#[derive(Debug)]
#[allow(dead_code)]
pub enum CliError {
    /// API-level errors from LLM providers (HTTP status, response body).
    Api {
        provider: String,
        status: u16,
        message: String,
    },
    /// Authentication failures (missing key, expired token, revoked).
    Auth {
        provider: String,
        message: String,
    },
    /// Configuration errors (missing config, parse failure).
    Config { message: String },
    /// Tool execution errors (tool not found, execution failed).
    Tool {
        tool_name: String,
        message: String,
    },
    /// Network errors (connection refused, timeout, DNS).
    Network { url: String, message: String },
    /// Context window overflow (too many tokens for model).
    ContextOverflow {
        model: String,
        token_count: usize,
        limit: usize,
    },
    /// Rate limiting from provider.
    RateLimited {
        provider: String,
        retry_after: Option<u64>,
    },
    /// SSE/streaming errors (mid-stream disconnect, malformed chunks).
    StreamError {
        provider: String,
        message: String,
        is_retryable: bool,
    },
}

// ---------------------------------------------------------------------------
// Display — user-facing messages
// ---------------------------------------------------------------------------

impl fmt::Display for CliError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CliError::Api {
                provider,
                status,
                message,
            } => write!(
                f,
                "[{}] API error (HTTP {}): {}",
                provider, status, message
            ),
            CliError::Auth { provider, message } => {
                write!(f, "[{}] Authentication failed: {}", provider, message)
            }
            CliError::Config { message } => write!(f, "Configuration error: {}", message),
            CliError::Tool { tool_name, message } => {
                write!(f, "Tool '{}' failed: {}", tool_name, message)
            }
            CliError::Network { url, message } => {
                write!(f, "Network error ({}): {}", url, message)
            }
            CliError::ContextOverflow {
                model,
                token_count,
                limit,
            } => write!(
                f,
                "Context overflow for model '{}': {} tokens exceeds limit of {}",
                model, token_count, limit
            ),
            CliError::RateLimited {
                provider,
                retry_after,
            } => match retry_after {
                Some(secs) => write!(
                    f,
                    "[{}] Rate limited — retry after {}s",
                    provider, secs
                ),
                None => write!(f, "[{}] Rate limited — please wait before retrying", provider),
            },
            CliError::StreamError {
                provider, message, ..
            } => {
                write!(f, "[{}] Stream error: {}", provider, message)
            }
        }
    }
}

impl std::error::Error for CliError {}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

// `CliError` implements `std::error::Error + Send + Sync + 'static`, so
// anyhow's blanket `impl<E: StdError + Send + Sync + 'static> From<E> for
// anyhow::Error` already provides `anyhow::Error::from(cli_err)` and the `?`
// operator in `Result<T, anyhow::Error>` contexts.  No explicit `From` impl
// is needed (and would conflict with the blanket impl).

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

#[allow(dead_code)]
impl CliError {
    /// Create an API error.
    pub fn api(provider: impl Into<String>, status: u16, message: impl Into<String>) -> Self {
        CliError::Api {
            provider: provider.into(),
            status,
            message: message.into(),
        }
    }

    /// Create an authentication error.
    pub fn auth(provider: impl Into<String>, message: impl Into<String>) -> Self {
        CliError::Auth {
            provider: provider.into(),
            message: message.into(),
        }
    }

    /// Create a configuration error.
    pub fn config(message: impl Into<String>) -> Self {
        CliError::Config {
            message: message.into(),
        }
    }

    /// Create a tool execution error.
    pub fn tool(tool_name: impl Into<String>, message: impl Into<String>) -> Self {
        CliError::Tool {
            tool_name: tool_name.into(),
            message: message.into(),
        }
    }

    /// Create a network error.
    pub fn network(url: impl Into<String>, message: impl Into<String>) -> Self {
        CliError::Network {
            url: url.into(),
            message: message.into(),
        }
    }

    /// Create a context overflow error.
    pub fn context_overflow(
        model: impl Into<String>,
        token_count: usize,
        limit: usize,
    ) -> Self {
        CliError::ContextOverflow {
            model: model.into(),
            token_count,
            limit,
        }
    }

    /// Create a rate-limited error.
    pub fn rate_limited(provider: impl Into<String>, retry_after: Option<u64>) -> Self {
        CliError::RateLimited {
            provider: provider.into(),
            retry_after,
        }
    }

    /// Create a stream error (mid-stream disconnect, malformed chunk, etc.).
    pub fn stream_error(
        provider: impl Into<String>,
        message: impl Into<String>,
        is_retryable: bool,
    ) -> Self {
        CliError::StreamError {
            provider: provider.into(),
            message: message.into(),
            is_retryable,
        }
    }
}

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

/// Default retry delay when no explicit `retry_after` is available.
#[allow(dead_code)]
const DEFAULT_RETRY_DELAY_SECS: u64 = 2;

/// Maximum backoff delay (30 seconds).
#[allow(dead_code)]
const MAX_BACKOFF_MS: u64 = 30_000;

/// HTTP status codes that indicate a retryable server-side error.
#[allow(dead_code)]
const RETRYABLE_API_STATUSES: &[u16] = &[429, 500, 502, 503, 504];

#[allow(dead_code)]
impl CliError {
    /// Returns `true` if the error is transient and the request can be retried.
    ///
    /// Retryable errors:
    /// - `RateLimited` (always)
    /// - `Network` (always — transient by nature)
    /// - `Api` with status 429, 500, 502, 503, or 504
    /// - `StreamError` when `is_retryable` is set
    pub fn is_retryable(&self) -> bool {
        match self {
            CliError::RateLimited { .. } | CliError::Network { .. } => true,
            CliError::Api { status, .. } => RETRYABLE_API_STATUSES.contains(status),
            CliError::StreamError { is_retryable, .. } => *is_retryable,
            _ => false,
        }
    }

    /// Suggested delay before retrying.
    ///
    /// For `RateLimited` errors, respects the provider's `retry_after` hint.
    /// Falls back to a 2-second default for all other retryable errors.
    pub fn retry_delay(&self) -> Duration {
        match self {
            CliError::RateLimited {
                retry_after: Some(secs),
                ..
            } => Duration::from_secs(*secs),
            _ => Duration::from_secs(DEFAULT_RETRY_DELAY_SECS),
        }
    }

    /// Exponential backoff delay for retry attempt `attempt` (1-indexed).
    ///
    /// Uses `retry_delay()` as the base and multiplies by 2^(attempt-1),
    /// capped at 30 seconds. Attempt 0 and 1 both return the base delay.
    ///
    /// Examples (with 2s base):
    /// - attempt 1 → 2s
    /// - attempt 2 → 4s
    /// - attempt 3 → 8s
    /// - attempt 4 → 16s
    /// - attempt 5 → 30s (capped)
    pub fn retry_delay_with_backoff(&self, attempt: u32) -> Duration {
        let base = self.retry_delay();
        let multiplier = 2u64.pow(attempt.saturating_sub(1));
        let delay = base.as_millis() as u64 * multiplier;
        Duration::from_millis(delay.min(MAX_BACKOFF_MS))
    }

    /// Returns `true` if this error represents a context/token overflow,
    /// either as an explicit `ContextOverflow` variant or by detecting
    /// provider-specific overflow messages in `Api` errors.
    pub fn is_context_overflow(&self) -> bool {
        match self {
            CliError::ContextOverflow { .. } => true,
            CliError::Api { message, .. } => detect_context_overflow(message),
            _ => false,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Display --

    #[test]
    fn display_api_error() {
        let err = CliError::api("openai", 401, "invalid api key");
        assert_eq!(
            err.to_string(),
            "[openai] API error (HTTP 401): invalid api key"
        );
    }

    #[test]
    fn display_auth_error() {
        let err = CliError::auth("anthropic", "key expired");
        assert_eq!(
            err.to_string(),
            "[anthropic] Authentication failed: key expired"
        );
    }

    #[test]
    fn display_config_error() {
        let err = CliError::config("missing default model");
        assert_eq!(err.to_string(), "Configuration error: missing default model");
    }

    #[test]
    fn display_tool_error() {
        let err = CliError::tool("run_command", "timeout after 30s");
        assert_eq!(
            err.to_string(),
            "Tool 'run_command' failed: timeout after 30s"
        );
    }

    #[test]
    fn display_network_error() {
        let err = CliError::network("https://api.openai.com/v1/chat", "connection refused");
        assert_eq!(
            err.to_string(),
            "Network error (https://api.openai.com/v1/chat): connection refused"
        );
    }

    #[test]
    fn display_context_overflow() {
        let err = CliError::context_overflow("gpt-4o", 200_000, 128_000);
        assert_eq!(
            err.to_string(),
            "Context overflow for model 'gpt-4o': 200000 tokens exceeds limit of 128000"
        );
    }

    #[test]
    fn display_rate_limited_with_retry() {
        let err = CliError::rate_limited("anthropic", Some(30));
        assert_eq!(
            err.to_string(),
            "[anthropic] Rate limited — retry after 30s"
        );
    }

    #[test]
    fn display_rate_limited_without_retry() {
        let err = CliError::rate_limited("google", None);
        assert_eq!(
            err.to_string(),
            "[google] Rate limited — please wait before retrying"
        );
    }

    #[test]
    fn display_stream_error() {
        let err = CliError::stream_error("anthropic", "connection reset mid-stream", true);
        assert_eq!(
            err.to_string(),
            "[anthropic] Stream error: connection reset mid-stream"
        );
    }

    // -- is_retryable --

    #[test]
    fn retryable_rate_limited() {
        let err = CliError::rate_limited("openai", Some(5));
        assert!(err.is_retryable());
    }

    #[test]
    fn retryable_network() {
        let err = CliError::network("https://api.example.com", "timeout");
        assert!(err.is_retryable());
    }

    #[test]
    fn retryable_api_429() {
        let err = CliError::api("openai", 429, "too many requests");
        assert!(err.is_retryable());
    }

    #[test]
    fn retryable_api_500() {
        let err = CliError::api("anthropic", 500, "internal server error");
        assert!(err.is_retryable());
    }

    #[test]
    fn retryable_api_502() {
        let err = CliError::api("google", 502, "bad gateway");
        assert!(err.is_retryable());
    }

    #[test]
    fn retryable_api_503() {
        let err = CliError::api("ollama", 503, "service unavailable");
        assert!(err.is_retryable());
    }

    #[test]
    fn retryable_api_504() {
        let err = CliError::api("openai", 504, "gateway timeout");
        assert!(err.is_retryable());
    }

    #[test]
    fn retryable_stream_error() {
        let err = CliError::stream_error("openai", "stream interrupted", true);
        assert!(err.is_retryable());
    }

    #[test]
    fn not_retryable_stream_error() {
        let err = CliError::stream_error("openai", "invalid json in stream", false);
        assert!(!err.is_retryable());
    }

    #[test]
    fn not_retryable_api_401() {
        let err = CliError::api("openai", 401, "unauthorized");
        assert!(!err.is_retryable());
    }

    #[test]
    fn not_retryable_api_400() {
        let err = CliError::api("anthropic", 400, "bad request");
        assert!(!err.is_retryable());
    }

    #[test]
    fn not_retryable_auth() {
        let err = CliError::auth("openai", "missing key");
        assert!(!err.is_retryable());
    }

    #[test]
    fn not_retryable_config() {
        let err = CliError::config("bad toml");
        assert!(!err.is_retryable());
    }

    #[test]
    fn not_retryable_tool() {
        let err = CliError::tool("read_file", "not found");
        assert!(!err.is_retryable());
    }

    #[test]
    fn not_retryable_context_overflow() {
        let err = CliError::context_overflow("gpt-4o", 200_000, 128_000);
        assert!(!err.is_retryable());
    }

    // -- retry_delay --

    #[test]
    fn retry_delay_from_rate_limit_header() {
        let err = CliError::rate_limited("anthropic", Some(60));
        assert_eq!(err.retry_delay(), Duration::from_secs(60));
    }

    #[test]
    fn retry_delay_rate_limit_no_header() {
        let err = CliError::rate_limited("openai", None);
        assert_eq!(err.retry_delay(), Duration::from_secs(DEFAULT_RETRY_DELAY_SECS));
    }

    #[test]
    fn retry_delay_network_uses_default() {
        let err = CliError::network("https://api.example.com", "dns failure");
        assert_eq!(err.retry_delay(), Duration::from_secs(DEFAULT_RETRY_DELAY_SECS));
    }

    #[test]
    fn retry_delay_api_uses_default() {
        let err = CliError::api("openai", 500, "internal error");
        assert_eq!(err.retry_delay(), Duration::from_secs(DEFAULT_RETRY_DELAY_SECS));
    }

    // -- retry_delay_with_backoff --

    #[test]
    fn backoff_attempt_0_returns_base() {
        let err = CliError::api("openai", 500, "error");
        // attempt 0: 2^(0-1 saturating) = 2^0 = 1 => 2000 * 1 = 2000ms
        assert_eq!(
            err.retry_delay_with_backoff(0),
            Duration::from_millis(2000)
        );
    }

    #[test]
    fn backoff_attempt_1_returns_base() {
        let err = CliError::api("openai", 500, "error");
        // attempt 1: 2^(1-1) = 2^0 = 1 => 2000 * 1 = 2000ms
        assert_eq!(
            err.retry_delay_with_backoff(1),
            Duration::from_millis(2000)
        );
    }

    #[test]
    fn backoff_attempt_2_doubles() {
        let err = CliError::api("openai", 500, "error");
        // attempt 2: 2^(2-1) = 2 => 2000 * 2 = 4000ms
        assert_eq!(
            err.retry_delay_with_backoff(2),
            Duration::from_millis(4000)
        );
    }

    #[test]
    fn backoff_attempt_3_quadruples() {
        let err = CliError::api("openai", 500, "error");
        // attempt 3: 2^(3-1) = 4 => 2000 * 4 = 8000ms
        assert_eq!(
            err.retry_delay_with_backoff(3),
            Duration::from_millis(8000)
        );
    }

    #[test]
    fn backoff_attempt_4() {
        let err = CliError::api("openai", 500, "error");
        // attempt 4: 2^(4-1) = 8 => 2000 * 8 = 16000ms
        assert_eq!(
            err.retry_delay_with_backoff(4),
            Duration::from_millis(16_000)
        );
    }

    #[test]
    fn backoff_caps_at_30s() {
        let err = CliError::api("openai", 500, "error");
        // attempt 5: 2^(5-1) = 16 => 2000 * 16 = 32000ms, capped to 30000
        assert_eq!(
            err.retry_delay_with_backoff(5),
            Duration::from_millis(30_000)
        );
    }

    #[test]
    fn backoff_very_high_attempt_caps() {
        let err = CliError::api("openai", 500, "error");
        assert_eq!(
            err.retry_delay_with_backoff(20),
            Duration::from_millis(30_000)
        );
    }

    #[test]
    fn backoff_with_rate_limit_retry_after() {
        let err = CliError::rate_limited("anthropic", Some(10));
        // base = 10s = 10000ms, attempt 2 => 10000 * 2 = 20000ms
        assert_eq!(
            err.retry_delay_with_backoff(2),
            Duration::from_millis(20_000)
        );
    }

    #[test]
    fn backoff_rate_limit_caps_at_30s() {
        let err = CliError::rate_limited("anthropic", Some(10));
        // base = 10s = 10000ms, attempt 3 => 10000 * 4 = 40000ms, capped to 30000
        assert_eq!(
            err.retry_delay_with_backoff(3),
            Duration::from_millis(30_000)
        );
    }

    // -- is_context_overflow --

    #[test]
    fn context_overflow_variant_detected() {
        let err = CliError::context_overflow("gpt-4o", 200_000, 128_000);
        assert!(err.is_context_overflow());
    }

    #[test]
    fn api_error_with_overflow_message_detected() {
        let err = CliError::api(
            "openai",
            400,
            "This model's maximum context length is 128000 tokens",
        );
        assert!(err.is_context_overflow());
    }

    #[test]
    fn api_error_without_overflow_not_detected() {
        let err = CliError::api("openai", 400, "invalid request body");
        assert!(!err.is_context_overflow());
    }

    #[test]
    fn non_api_error_not_context_overflow() {
        let err = CliError::network("https://api.example.com", "timeout");
        assert!(!err.is_context_overflow());
    }

    #[test]
    fn stream_error_not_context_overflow() {
        let err = CliError::stream_error("openai", "connection reset", true);
        assert!(!err.is_context_overflow());
    }

    // -- detect_context_overflow patterns --

    #[test]
    fn overflow_anthropic_prompt_too_long() {
        assert!(detect_context_overflow("prompt is too long"));
        assert!(detect_context_overflow("Error: Prompt is too long for this model"));
    }

    #[test]
    fn overflow_bedrock_input_too_long() {
        assert!(detect_context_overflow("input is too long"));
        assert!(detect_context_overflow("The input is too long for the model."));
    }

    #[test]
    fn overflow_openai_context_window() {
        assert!(detect_context_overflow(
            "This request exceeds the context window for gpt-4"
        ));
    }

    #[test]
    fn overflow_gemini_input_token_count() {
        assert!(detect_context_overflow(
            "input token count of 150000 exceeds the maximum of 128000"
        ));
    }

    #[test]
    fn overflow_xai_maximum_prompt_length() {
        assert!(detect_context_overflow("maximum prompt length exceeded"));
    }

    #[test]
    fn overflow_groq_reduce_length() {
        assert!(detect_context_overflow(
            "Please reduce the length of the messages or completion"
        ));
    }

    #[test]
    fn overflow_openrouter_maximum_context_length() {
        assert!(detect_context_overflow(
            "maximum context length is 128000 tokens"
        ));
        assert!(detect_context_overflow(
            "This model's maximum context length is 8192 tokens"
        ));
    }

    #[test]
    fn overflow_github_copilot_exceeds_limit() {
        assert!(detect_context_overflow("Input exceeds the limit"));
    }

    #[test]
    fn overflow_llamacpp_available_context_size() {
        assert!(detect_context_overflow(
            "the request exceeds the available context size"
        ));
    }

    #[test]
    fn overflow_lmstudio_greater_than_context() {
        assert!(detect_context_overflow(
            "input length is greater than the context length"
        ));
    }

    #[test]
    fn overflow_minimax_context_window() {
        assert!(detect_context_overflow("context window exceeds limit"));
    }

    #[test]
    fn overflow_kimi_model_token_limit() {
        assert!(detect_context_overflow("exceeded model token limit"));
    }

    #[test]
    fn overflow_generic_context_length_exceeded() {
        assert!(detect_context_overflow("context length exceeded"));
        assert!(detect_context_overflow("context_length_exceeded"));
    }

    #[test]
    fn overflow_http_413() {
        assert!(detect_context_overflow("request entity too large"));
        assert!(detect_context_overflow("413 Request Entity Too Large"));
    }

    #[test]
    fn overflow_token_limit_exceeded() {
        assert!(detect_context_overflow("token limit exceeded"));
    }

    #[test]
    fn overflow_too_many_tokens() {
        assert!(detect_context_overflow("too many tokens in the request"));
    }

    #[test]
    fn overflow_cohere_total_tokens() {
        assert!(detect_context_overflow(
            "total number of tokens has exceeded the allowed limit"
        ));
    }

    #[test]
    fn no_overflow_normal_messages() {
        assert!(!detect_context_overflow("invalid api key"));
        assert!(!detect_context_overflow("rate limit exceeded"));
        assert!(!detect_context_overflow("internal server error"));
        assert!(!detect_context_overflow("connection refused"));
        assert!(!detect_context_overflow("model not found"));
    }

    #[test]
    fn overflow_case_insensitive() {
        assert!(detect_context_overflow("PROMPT IS TOO LONG"));
        assert!(detect_context_overflow("Maximum Context Length Is 8192 Tokens"));
        assert!(detect_context_overflow("CONTEXT_LENGTH_EXCEEDED"));
    }

    // -- From<CliError> for anyhow::Error --

    #[test]
    fn converts_to_anyhow() {
        let err = CliError::config("bad config");
        let anyhow_err: anyhow::Error = err.into();
        assert!(anyhow_err.to_string().contains("Configuration error"));
    }
}
