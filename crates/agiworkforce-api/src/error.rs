use crate::rate_limits::RateLimitError;
use agiworkforce_client::TransportError;
use http::StatusCode;
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error(transparent)]
    Transport(#[from] TransportError),
    #[error("api error {status}: {message}")]
    Api { status: StatusCode, message: String },
    #[error("stream error: {0}")]
    Stream(String),
    #[error("context window exceeded")]
    ContextWindowExceeded,
    #[error("quota exceeded")]
    QuotaExceeded,
    #[error("usage not included")]
    UsageNotIncluded,
    #[error("retryable error: {message}")]
    Retryable {
        message: String,
        delay: Option<Duration>,
    },
    #[error("rate limit: {0}")]
    RateLimit(String),
    #[error("invalid request: {message}")]
    InvalidRequest { message: String },
    #[error("server overloaded")]
    ServerOverloaded,
    #[error("cyber policy: {message}")]
    CyberPolicy { message: String },
}

impl From<RateLimitError> for ApiError {
    fn from(err: RateLimitError) -> Self {
        Self::RateLimit(err.to_string())
    }
}

/// Convert an `ApiError` to a protocol-level `AgiworkforceErr`.
pub fn map_api_error(err: ApiError) -> agiworkforce_protocol::error::AgiworkforceErr {
    use agiworkforce_protocol::error::AgiworkforceErr;
    match err {
        ApiError::ContextWindowExceeded => AgiworkforceErr::ContextWindowExceeded,
        ApiError::QuotaExceeded => AgiworkforceErr::QuotaExceeded,
        ApiError::UsageNotIncluded => AgiworkforceErr::UsageNotIncluded,
        ApiError::ServerOverloaded => AgiworkforceErr::ServerOverloaded,
        ApiError::CyberPolicy { message } => AgiworkforceErr::CyberPolicy { message },
        ApiError::InvalidRequest { message } => AgiworkforceErr::InvalidRequest(message),
        ApiError::Stream(msg) => AgiworkforceErr::Stream(msg, None),
        ApiError::Retryable { message, delay } => AgiworkforceErr::Stream(message, delay),
        ApiError::Transport(e) => AgiworkforceErr::Fatal(e.to_string()),
        ApiError::Api { status, message } => {
            AgiworkforceErr::Fatal(format!("api error {status}: {message}"))
        }
        ApiError::RateLimit(msg) => AgiworkforceErr::Fatal(format!("rate limit: {msg}")),
    }
}
