use agiworkforce_protocol::developer_session::{TurnFailure, TurnFailureCode};
use regex::Regex;
use std::fmt;
use std::sync::LazyLock;
use std::time::Duration;

// ---------------------------------------------------------------------------
// Context overflow detection, 17 regex patterns covering every major provider
// ---------------------------------------------------------------------------

/// Compiled regex patterns that detect context/token overflow errors across
/// all major LLM providers. Each pattern is case-insensitive.
///
/// Sources:
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
    /// Authentication failures where a credential exists and was rejected:
    /// expired, revoked, wrong key.
    Auth { provider: String, message: String },
    /// No credential exists for the route at all.
    ///
    /// Separate from [`CliError::Auth`] because the remedy is different and a
    /// client has to be able to tell them apart: nothing can be refreshed, the
    /// user has to sign in or set a key for the first time.
    AuthMissing { provider: String, message: String },
    /// Configuration errors (missing config, parse failure).
    Config { message: String },
    /// Tool execution errors (tool not found, execution failed).
    Tool { tool_name: String, message: String },
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
    /// No AGI Workforce session, and no other route can run the model.
    AccountSignedOut { model: String },
    /// Signed in, but the account's plan does not include the model.
    PlanExcludesModel { model: String, tier: String },
    /// On the plan, but the hosted list withholds the model right now.
    ModelUnavailable { model: String },
    /// AGI Workforce managed-cloud paywall, user's tier cap reached.
    ///
    /// HTTP 429 + `{"kind":"paywall", "feature":..., "requiredTier":..., "reason":...}`
    /// returned by `api/llm/v1/chat/completions` when the user has consumed
    /// 150 % of their monthly token quota.  Exit code 78 (EX_CONFIG per
    /// sysexits.h, "configuration error requiring user action").
    Paywall {
        feature: String,
        required_tier: String,
        reason: String,
    },
    /// The deployment no longer answers the contract version this build sends.
    /// Nothing about the request is wrong, so it is not an API failure: the
    /// binary is the thing that is out of date.
    ClientUpdateRequired {
        message: Option<String>,
        minimum_api_version: Option<String>,
    },
}

/// What a non-zero exit tells a script. The values are `sysexits.h`, so a
/// shell that already reads those reads these, and every class is distinct:
/// an expired credential and an unreachable host are not the same failure and
/// a caller must be able to branch on which it got.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExitClass {
    Failure,
    DataError,
    Unavailable,
    TemporaryFailure,
    ProtocolTooOld,
    NoPermission,
    Configuration,
}

impl ExitClass {
    pub const ALL: &'static [ExitClass] = &[
        Self::Failure,
        Self::DataError,
        Self::Unavailable,
        Self::TemporaryFailure,
        Self::ProtocolTooOld,
        Self::NoPermission,
        Self::Configuration,
    ];

    /// Exit status of the process. `2` is never used: it is what the argument
    /// parser exits with, and a usage mistake must stay distinguishable from
    /// anything the command itself decided.
    pub fn code(self) -> i32 {
        match self {
            Self::Failure => 1,
            Self::DataError => 65,
            Self::Unavailable => 69,
            Self::TemporaryFailure => 75,
            Self::ProtocolTooOld => 76,
            Self::NoPermission => 77,
            Self::Configuration => 78,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Failure => "the command failed",
            Self::DataError => "the input the command was given cannot be used",
            Self::Unavailable => "a service the command needs did not answer",
            Self::TemporaryFailure => "the same command may succeed later",
            Self::ProtocolTooOld => "this build is older than the deployment answers",
            Self::NoPermission => "the account is not signed in or not permitted",
            Self::Configuration => "something the user configured has to change",
        }
    }
}

/// The status the argument parser exits with. Reserved, never a class of ours.
pub const USAGE_EXIT_CODE: i32 = 2;

// ---------------------------------------------------------------------------
// Display, user-facing messages
// ---------------------------------------------------------------------------

impl fmt::Display for CliError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CliError::Api {
                provider,
                status,
                message,
            } => write!(f, "[{}] API error (HTTP {}): {}", provider, status, message),
            CliError::Auth { provider, message } => {
                write!(f, "[{}] Authentication failed: {}", provider, message)
            }
            CliError::AuthMissing { provider, message } => {
                write!(f, "[{}] Authentication failed: {}", provider, message)
            }
            CliError::Config { message } => write!(f, "Configuration error: {}", message),
            CliError::ClientUpdateRequired {
                message,
                minimum_api_version,
            } => {
                f.write_str("Update the AGI CLI to continue: this build speaks API contract ")?;
                f.write_str(crate::cloud::handshake::API_CONTRACT_VERSION)?;
                match minimum_api_version {
                    Some(minimum) => write!(f, " and the deployment answers {minimum} or newer.")?,
                    None => f.write_str(" and the deployment no longer answers it.")?,
                }
                match message {
                    Some(message) => write!(f, " {message}"),
                    None => Ok(()),
                }
            }
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
            CliError::RateLimited { provider, .. } => {
                write!(f, "[{}] {}", provider, self.detail())
            }
            CliError::StreamError {
                provider, message, ..
            } => {
                write!(f, "[{}] Stream error: {}", provider, message)
            }
            CliError::AccountSignedOut { model } => {
                write!(
                    f,
                    "No AGI Workforce session, and no provider key for '{}'.",
                    model
                )
            }
            CliError::PlanExcludesModel { model, tier } => {
                write!(
                    f,
                    "Your {} plan does not include '{}', and no provider key for it is set.",
                    tier, model
                )
            }
            CliError::ModelUnavailable { model } => {
                write!(f, "'{}' is unavailable on your plan right now.", model)
            }
            CliError::Paywall {
                feature,
                required_tier,
                reason,
            } => {
                write!(
                    f,
                    "Cloud chat requires {} plan. Reason: {}\nUpgrade: https://agiworkforce.com/pricing?from=cli-paywall&tier={}&feature={}",
                    required_tier,
                    reason,
                    urlencoding::encode(required_tier),
                    urlencoding::encode(feature),
                )
            }
        }
    }
}

impl CliError {
    /// The failure as one sentence without the terminal's provider prefix; a
    /// client shows it beside the provider the failure names.
    pub fn detail(&self) -> String {
        match self {
            CliError::Api { message, .. }
            | CliError::Auth { message, .. }
            | CliError::AuthMissing { message, .. }
            | CliError::StreamError { message, .. } => message.clone(),
            CliError::RateLimited { retry_after, .. } => match retry_after {
                Some(secs) => format!("Rate limited, retry after {secs}s"),
                None => "Rate limited, please wait before retrying".to_string(),
            },
            other => other.to_string(),
        }
    }
}

impl std::error::Error for CliError {}

/// The error and its remedy for a terminal; other surfaces take the remedy
/// from the failure's action instead.
pub fn terminal_text(error: &anyhow::Error) -> String {
    let text = format!("{error:#}");
    match cli_cause(error) {
        Some(cli) => format!("{text}\n{}", cli.hint()),
        None => text,
    }
}

/// The `--json` result for a failed turn, with the typed kind and the remedy
/// beside the text so a script reads them without parsing prose.
pub fn result_error_json(error: &anyhow::Error) -> serde_json::Value {
    let cli = cli_cause(error);
    serde_json::json!({
        "type": "result",
        "is_error": true,
        "error": format!("{error:#}"),
        "kind": cli.map(CliError::kind),
        "hint": cli.map(CliError::hint),
    })
}

fn cli_cause(error: &anyhow::Error) -> Option<&CliError> {
    error
        .chain()
        .find_map(|cause| cause.downcast_ref::<CliError>())
}

// ---------------------------------------------------------------------------
// Deterministic error classification, for `--json-events` and CI
// ---------------------------------------------------------------------------

/// `agi login <provider>` for these opens a vendor subscription sign-in rather
/// than an API-key prompt, which is a founder decision still open, so no copy
/// may send a user there.
pub fn login_opens_vendor_subscription(provider: &str) -> bool {
    matches!(provider, "openai" | "anthropic")
}

impl CliError {
    /// Stable, machine-readable kind. Never localized, never reformatted; safe
    /// to grep, `jq -r '.kind'`, and pattern-match in CI runbooks.
    pub fn kind(&self) -> &'static str {
        match self {
            CliError::Api { status, .. } if (500..600).contains(status) => "api_server_error",
            CliError::Api { .. } => "api_http_error",
            CliError::Auth { .. } => "auth_expired",
            CliError::AuthMissing { .. } => "auth_missing",
            CliError::Config { .. } => "config_invalid",
            CliError::ClientUpdateRequired { .. } => "client_update_required",
            CliError::Tool { .. } => "tool_failed",
            CliError::Network { .. } => "network",
            CliError::ContextOverflow { .. } => "context_overflow",
            CliError::RateLimited { .. } => "api_rate_limit",
            CliError::StreamError { .. } => "stream_disconnect",
            CliError::AccountSignedOut { .. } => "account_signed_out",
            CliError::PlanExcludesModel { .. } => "plan_excludes_model",
            CliError::ModelUnavailable { .. } => "model_unavailable",
            CliError::Paywall { .. } => "paywall",
        }
    }

    /// Actionable runbook hint for the user. One sentence, imperative voice,
    /// always present. No "please" or vague language, we tell the user
    /// exactly what to try next.
    pub fn hint(&self) -> String {
        match self {
            CliError::Api {
                provider, status, ..
            } if (500..600).contains(status)
                && provider
                    == crate::models::provider_name(&crate::models::Provider::ManagedCloud) =>
            {
                "Pick another model with `agi models list`, or try again later.".to_string()
            }
            CliError::Api {
                provider, status, ..
            } if (500..600).contains(status) => format!(
                "{provider} returned HTTP {status}. Retry the request, or run again with \
                 `--fallback-model <model>`."
            ),
            CliError::Api {
                provider, status, ..
            } => format!(
                "{provider} rejected the request with HTTP {status}. Check `agi \
                 auth-status` and the request payload for invalid fields."
            ),
            CliError::Auth { provider, .. } => format!(
                "Run `agi login {provider}` to refresh credentials, or set the \
                 corresponding API key environment variable."
            ),
            CliError::AuthMissing { provider, .. } => {
                if provider == crate::models::provider_name(&crate::models::Provider::ManagedCloud)
                {
                    "Run `agi login` to use your AGI Workforce plan.".to_string()
                } else if login_opens_vendor_subscription(provider) {
                    format!(
                        "Run `agi login` to use your AGI Workforce plan, or set the \
                         {provider} API key environment variable to use your own key."
                    )
                } else {
                    format!(
                        "Run `agi login` to use your AGI Workforce plan, or run \
                         `agi login {provider}` to use your own key."
                    )
                }
            }
            CliError::Config { .. } => {
                "Run `agi init` to regenerate the default config, or fix the indicated \
                 file path manually."
                    .to_string()
            }
            CliError::ClientUpdateRequired { .. } => {
                "Run `agi update` to install a build this deployment still answers.".to_string()
            }
            CliError::Tool { tool_name, .. } => format!(
                "Tool `{tool_name}` failed. Run `agi execpolicy` to see allowed commands \
                 and re-prompt with the corrected invocation."
            ),
            CliError::Network { .. } => "Check your network connection and retry. If a corporate \
                                         proxy is required, set `HTTPS_PROXY` and re-run."
                .to_string(),
            CliError::ContextOverflow { model, .. } => format!(
                "Context exceeded for `{model}`. Try `/compact` to summarize history, or switch \
                 to a model with a larger context window."
            ),
            CliError::RateLimited {
                provider,
                retry_after,
            } => match retry_after {
                Some(secs) => format!(
                    "{provider} is rate-limiting. Wait {secs}s, or run again with \
                     `--fallback-model <model>`."
                ),
                None => format!(
                    "{provider} is rate-limiting. Run again with `--fallback-model <model>`, \
                     or wait and retry."
                ),
            },
            CliError::StreamError { is_retryable, .. } => if *is_retryable {
                "Stream disconnected. Retrying automatically; if it persists, check provider \
                 status."
            } else {
                "Pick another model with `agi models list`, or try again later."
            }
            .to_string(),
            CliError::AccountSignedOut { .. } => {
                "Run `agi login` to use your AGI Workforce plan, or set the provider's own key."
                    .to_string()
            }
            CliError::PlanExcludesModel { .. } => {
                "Upgrade at https://agiworkforce.com/pricing, choose a model your plan includes, \
                 or set that provider's own key."
                    .to_string()
            }
            CliError::ModelUnavailable { .. } => {
                "Choose another model, or try again shortly; `agi models list` shows what is \
                 available now."
                    .to_string()
            }
            CliError::Paywall { required_tier, .. } => format!(
                "Visit https://agiworkforce.com/pricing to upgrade to {required_tier}, \
                 or switch to a BYOK provider with `--provider anthropic`."
            ),
        }
    }
}

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

    /// Create an authentication error for a credential that was rejected.
    pub fn auth(provider: impl Into<String>, message: impl Into<String>) -> Self {
        CliError::Auth {
            provider: provider.into(),
            message: message.into(),
        }
    }

    /// Create an authentication error for a route with no credential at all.
    pub fn auth_missing(provider: impl Into<String>, message: impl Into<String>) -> Self {
        CliError::AuthMissing {
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
    pub fn context_overflow(model: impl Into<String>, token_count: usize, limit: usize) -> Self {
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

    /// Create a paywall error (AGI Workforce managed-cloud tier cap exceeded).
    pub fn paywall(
        feature: impl Into<String>,
        required_tier: impl Into<String>,
        reason: impl Into<String>,
    ) -> Self {
        CliError::Paywall {
            feature: feature.into(),
            required_tier: required_tier.into(),
            reason: reason.into(),
        }
    }

    /// Returns true if this error is a paywall response (exits with EX_CONFIG = 78).
    pub fn is_paywall(&self) -> bool {
        matches!(self, CliError::Paywall { .. })
    }

    /// Which class of failure a caller is looking at. Every variant answers,
    /// so a new one cannot quietly join the undifferentiated pile.
    pub fn exit_class(&self) -> ExitClass {
        match self {
            CliError::Api { status, .. } if (500..600).contains(status) => ExitClass::Unavailable,
            CliError::Api { .. } => ExitClass::Failure,
            CliError::Auth { .. } | CliError::AuthMissing { .. } => ExitClass::NoPermission,
            CliError::AccountSignedOut { .. } => ExitClass::NoPermission,
            CliError::Config { .. } => ExitClass::Configuration,
            CliError::Tool { .. } => ExitClass::Failure,
            CliError::Network { .. } => ExitClass::Unavailable,
            CliError::ContextOverflow { .. } => ExitClass::DataError,
            CliError::RateLimited { .. } => ExitClass::TemporaryFailure,
            CliError::StreamError { is_retryable, .. } => {
                if *is_retryable {
                    ExitClass::TemporaryFailure
                } else {
                    ExitClass::Failure
                }
            }
            CliError::PlanExcludesModel { .. } | CliError::Paywall { .. } => {
                ExitClass::Configuration
            }
            CliError::ModelUnavailable { .. } => ExitClass::Unavailable,
            CliError::ClientUpdateRequired { .. } => ExitClass::ProtocolTooOld,
        }
    }

    /// Exit code for this error, from its class.
    pub fn exit_code(&self) -> i32 {
        self.exit_class().code()
    }

    /// Project this error onto the protocol's closed turn-failure set.
    ///
    /// The `error` string a client receives today is prose: it names a
    /// provider, a status code and a remedy in one sentence that changes with
    /// every provider. A client cannot branch on it. This is the same
    /// information as a code the client can act on.
    pub fn turn_failure(&self) -> TurnFailure {
        let (code, provider) = match self {
            CliError::AuthMissing { provider, .. } => {
                (TurnFailureCode::ProviderAuthMissing, Some(provider))
            }
            CliError::Auth { provider, .. } => {
                (TurnFailureCode::ProviderAuthInvalid, Some(provider))
            }
            CliError::RateLimited { provider, .. } => {
                (TurnFailureCode::ProviderRateLimited, Some(provider))
            }
            // A paywall is a quota the account has spent, not a broken
            // credential: the same shape as a rate limit, and the remedy is
            // the plan rather than a sign-in.
            CliError::AccountSignedOut { .. } => (TurnFailureCode::AccountSignedOut, None),
            CliError::PlanExcludesModel { .. } => (TurnFailureCode::PlanExcludesModel, None),
            CliError::ModelUnavailable { .. } => (TurnFailureCode::ProviderUnavailable, None),
            CliError::Paywall { .. } => (TurnFailureCode::ProviderRateLimited, None),
            CliError::Api {
                provider, status, ..
            } => (
                match status {
                    401 | 403 => TurnFailureCode::ProviderAuthInvalid,
                    429 => TurnFailureCode::ProviderRateLimited,
                    408 | 504 => TurnFailureCode::Timeout,
                    500..=599 => TurnFailureCode::ProviderUnavailable,
                    _ => TurnFailureCode::InvalidRequest,
                },
                Some(provider),
            ),
            CliError::StreamError { provider, .. } => {
                (TurnFailureCode::ProviderUnavailable, Some(provider))
            }
            CliError::Network { .. } => (TurnFailureCode::Network, None),
            CliError::ContextOverflow { .. } => (TurnFailureCode::ContextWindowExceeded, None),
            CliError::Tool { .. } => (TurnFailureCode::ToolDenied, None),
            CliError::Config { .. } => (TurnFailureCode::InvalidRequest, None),
            CliError::ClientUpdateRequired { .. } => (TurnFailureCode::InvalidRequest, None),
        };
        let failure = TurnFailure::new(code, self.detail());
        match (provider, self) {
            (Some(provider), _) => failure.with_provider(provider.clone()),
            (None, CliError::ModelUnavailable { .. }) => failure.with_provider(
                crate::models::provider_name(&crate::models::Provider::ManagedCloud),
            ),
            (None, _) => failure,
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
    /// - `Network` (always, transient by nature)
    /// - `Api` with status 429, 500, 502, 503, or 504
    /// - `StreamError` when `is_retryable` is set
    pub fn is_retryable(&self) -> bool {
        match self {
            CliError::RateLimited { .. }
            | CliError::Network { .. }
            | CliError::ModelUnavailable { .. } => true,
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
        assert_eq!(
            err.to_string(),
            "Configuration error: missing default model"
        );
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
        let err = CliError::context_overflow("fixture-overflow-model", 200_000, 128_000);
        assert_eq!(
            err.to_string(),
            "Context overflow for model 'fixture-overflow-model': 200000 tokens exceeds limit of 128000"
        );
    }

    #[test]
    fn display_rate_limited_with_retry() {
        let err = CliError::rate_limited("anthropic", Some(30));
        assert_eq!(err.to_string(), "[anthropic] Rate limited, retry after 30s");
    }

    #[test]
    fn display_rate_limited_without_retry() {
        let err = CliError::rate_limited("google", None);
        assert_eq!(
            err.to_string(),
            "[google] Rate limited, please wait before retrying"
        );
    }

    #[test]
    fn display_account_signed_out_states_the_fact_without_a_terminal_remedy() {
        let err = CliError::AccountSignedOut {
            model: "fixture-model".to_string(),
        };
        assert_eq!(
            err.to_string(),
            "No AGI Workforce session, and no provider key for 'fixture-model'."
        );
        assert!(!err.turn_failure().message.contains("agi login"));
    }

    #[test]
    fn a_withheld_plan_model_fails_as_a_route_outage_without_a_terminal_hint() {
        let err = CliError::ModelUnavailable {
            model: "fixture-model".to_string(),
        };
        let failure = err.turn_failure();
        assert_eq!(failure.code, TurnFailureCode::ProviderUnavailable);
        assert_eq!(failure.provider.as_deref(), Some("managed_cloud"));
        assert!(failure.retryable);
        assert_eq!(
            failure.message,
            "'fixture-model' is unavailable on your plan right now."
        );
        assert!(err.hint().contains("agi models list"));
    }

    #[test]
    fn the_protocol_message_drops_the_terminal_prefix() {
        let sentence = "The model failed to produce a response.";
        let stream = CliError::stream_error("managed_cloud", sentence, false);
        assert_eq!(stream.turn_failure().message, sentence);
        assert_eq!(
            stream.to_string(),
            format!("[managed_cloud] Stream error: {sentence}")
        );
        let api = CliError::api("openai", 400, "messages.0.content: Invalid input");
        assert_eq!(
            api.turn_failure().message,
            "messages.0.content: Invalid input"
        );
        assert_eq!(
            CliError::rate_limited("anthropic", Some(30))
                .turn_failure()
                .message,
            "Rate limited, retry after 30s"
        );
    }

    #[test]
    fn terminal_text_adds_the_remedy_under_the_error() {
        let error = anyhow::Error::new(CliError::AccountSignedOut {
            model: "fixture-model".to_string(),
        })
        .context("while running the turn");
        let text = terminal_text(&error);
        assert!(text.starts_with("while running the turn: No AGI Workforce session"));
        assert!(text.ends_with(
            "Run `agi login` to use your AGI Workforce plan, or set the provider's own key."
        ));
        assert_eq!(terminal_text(&anyhow::anyhow!("plain")), "plain");
    }

    #[test]
    fn the_json_result_carries_the_kind_and_the_remedy_beside_the_text() {
        let error = anyhow::Error::new(CliError::AccountSignedOut {
            model: "fixture-model".to_string(),
        });
        let json = result_error_json(&error);
        assert_eq!(json["is_error"], true);
        assert_eq!(json["kind"], "account_signed_out");
        assert!(json["error"]
            .as_str()
            .unwrap()
            .starts_with("No AGI Workforce session"));
        assert!(json["hint"].as_str().unwrap().contains("agi login"));
        let plain = result_error_json(&anyhow::anyhow!("plain"));
        assert!(plain["kind"].is_null() && plain["hint"].is_null());
    }

    #[test]
    fn a_missing_managed_session_hint_names_only_the_plan_sign_in() {
        let err = CliError::auth_missing("managed_cloud", "No AGI Workforce session found.");
        assert_eq!(
            err.hint(),
            "Run `agi login` to use your AGI Workforce plan."
        );
    }

    #[test]
    fn a_managed_refusal_hint_points_at_the_model_list() {
        let refused = CliError::api(
            "managed_cloud",
            503,
            "This model is unavailable right now because of a problem on our side.",
        );
        assert_eq!(
            refused.hint(),
            "Pick another model with `agi models list`, or try again later."
        );
        let vendor = CliError::api("openai", 503, "upstream failed");
        assert!(vendor.hint().contains("Retry the request"));
    }

    #[test]
    fn fallback_hints_name_the_real_flag() {
        let limited = CliError::RateLimited {
            provider: "openai".to_string(),
            retry_after: Some(12),
        };
        assert_eq!(
            limited.hint(),
            "openai is rate-limiting. Wait 12s, or run again with `--fallback-model <model>`."
        );
        let vendor = CliError::api("openai", 503, "upstream failed");
        assert!(vendor.hint().contains("`--fallback-model <model>`"));
        assert!(!vendor.hint().contains("agi features"));
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
        let err = CliError::context_overflow("fixture-overflow-model", 200_000, 128_000);
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
        assert_eq!(
            err.retry_delay(),
            Duration::from_secs(DEFAULT_RETRY_DELAY_SECS)
        );
    }

    #[test]
    fn retry_delay_network_uses_default() {
        let err = CliError::network("https://api.example.com", "dns failure");
        assert_eq!(
            err.retry_delay(),
            Duration::from_secs(DEFAULT_RETRY_DELAY_SECS)
        );
    }

    #[test]
    fn retry_delay_api_uses_default() {
        let err = CliError::api("openai", 500, "internal error");
        assert_eq!(
            err.retry_delay(),
            Duration::from_secs(DEFAULT_RETRY_DELAY_SECS)
        );
    }

    // -- retry_delay_with_backoff --

    #[test]
    fn backoff_attempt_0_returns_base() {
        let err = CliError::api("openai", 500, "error");
        // attempt 0: 2^(0-1 saturating) = 2^0 = 1 => 2000 * 1 = 2000ms
        assert_eq!(err.retry_delay_with_backoff(0), Duration::from_millis(2000));
    }

    #[test]
    fn backoff_attempt_1_returns_base() {
        let err = CliError::api("openai", 500, "error");
        // attempt 1: 2^(1-1) = 2^0 = 1 => 2000 * 1 = 2000ms
        assert_eq!(err.retry_delay_with_backoff(1), Duration::from_millis(2000));
    }

    #[test]
    fn backoff_attempt_2_doubles() {
        let err = CliError::api("openai", 500, "error");
        // attempt 2: 2^(2-1) = 2 => 2000 * 2 = 4000ms
        assert_eq!(err.retry_delay_with_backoff(2), Duration::from_millis(4000));
    }

    #[test]
    fn backoff_attempt_3_quadruples() {
        let err = CliError::api("openai", 500, "error");
        // attempt 3: 2^(3-1) = 4 => 2000 * 4 = 8000ms
        assert_eq!(err.retry_delay_with_backoff(3), Duration::from_millis(8000));
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
        let err = CliError::context_overflow("fixture-overflow-model", 200_000, 128_000);
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
        assert!(detect_context_overflow(
            "Error: Prompt is too long for this model"
        ));
    }

    #[test]
    fn overflow_bedrock_input_too_long() {
        assert!(detect_context_overflow("input is too long"));
        assert!(detect_context_overflow(
            "The input is too long for the model."
        ));
    }

    #[test]
    fn overflow_openai_context_window() {
        assert!(detect_context_overflow(
            "This request exceeds the context window for fixture-context-model"
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
        assert!(detect_context_overflow(
            "Maximum Context Length Is 8192 Tokens"
        ));
        assert!(detect_context_overflow("CONTEXT_LENGTH_EXCEEDED"));
    }

    // -- From<CliError> for anyhow::Error --

    #[test]
    fn converts_to_anyhow() {
        let err = CliError::config("bad config");
        let anyhow_err: anyhow::Error = err.into();
        assert!(anyhow_err.to_string().contains("Configuration error"));
    }

    /// Every failure a caller can be handed, so a class added to `CliError`
    /// without a place in the contract shows up here rather than silently
    /// joining the pile that exits 1.
    fn every_failure() -> Vec<CliError> {
        vec![
            CliError::api("anthropic", 400, "bad request"),
            CliError::api("anthropic", 503, "upstream down"),
            CliError::auth("openai", "expired"),
            CliError::auth_missing("openai", "no key"),
            CliError::config("unreadable"),
            CliError::tool("bash", "exit 1"),
            CliError::network("https://example.invalid", "refused"),
            CliError::context_overflow("m", 10, 5),
            CliError::rate_limited("anthropic", None),
            CliError::stream_error("anthropic", "cut", true),
            CliError::stream_error("anthropic", "malformed", false),
            CliError::AccountSignedOut { model: "m".into() },
            CliError::PlanExcludesModel {
                model: "m".into(),
                tier: "free".into(),
            },
            CliError::ModelUnavailable { model: "m".into() },
            CliError::paywall("chat", "pro", "quota"),
            CliError::ClientUpdateRequired {
                message: None,
                minimum_api_version: None,
            },
        ]
    }

    #[test]
    fn each_kind_of_failure_exits_on_its_own_class_and_never_on_the_parser_status() {
        let expected: Vec<(&str, ExitClass)> = vec![
            ("api_http_error", ExitClass::Failure),
            ("api_server_error", ExitClass::Unavailable),
            ("auth_expired", ExitClass::NoPermission),
            ("auth_missing", ExitClass::NoPermission),
            ("config_invalid", ExitClass::Configuration),
            ("tool_failed", ExitClass::Failure),
            ("network", ExitClass::Unavailable),
            ("context_overflow", ExitClass::DataError),
            ("api_rate_limit", ExitClass::TemporaryFailure),
            ("stream_disconnect", ExitClass::TemporaryFailure),
            ("stream_disconnect", ExitClass::Failure),
            ("account_signed_out", ExitClass::NoPermission),
            ("plan_excludes_model", ExitClass::Configuration),
            ("model_unavailable", ExitClass::Unavailable),
            ("paywall", ExitClass::Configuration),
            ("client_update_required", ExitClass::ProtocolTooOld),
        ];
        let actual: Vec<(&str, ExitClass)> = every_failure()
            .iter()
            .map(|error| (error.kind(), error.exit_class()))
            .collect();
        assert_eq!(actual, expected);

        for error in every_failure() {
            let code = error.exit_code();
            assert_ne!(code, 0, "{} exits as a success", error.kind());
            assert_ne!(
                code,
                USAGE_EXIT_CODE,
                "{} is indistinguishable from a usage mistake",
                error.kind()
            );
        }
    }

    #[test]
    fn a_signed_out_account_an_unreachable_host_and_a_stale_build_are_three_different_statuses() {
        let codes = [
            CliError::auth_missing("agiworkforce", "no session").exit_code(),
            CliError::network("https://example.invalid", "refused").exit_code(),
            CliError::ClientUpdateRequired {
                message: None,
                minimum_api_version: None,
            }
            .exit_code(),
            CliError::tool("bash", "exit 1").exit_code(),
        ];
        let mut distinct = codes;
        distinct.sort_unstable();
        distinct_check(&distinct, codes.len());
    }

    fn distinct_check(sorted: &[i32], expected: usize) {
        let mut unique = sorted.to_vec();
        unique.dedup();
        assert_eq!(
            unique.len(),
            expected,
            "two failures a script must tell apart share an exit status: {sorted:?}"
        );
    }

    #[test]
    fn every_exit_class_has_a_distinct_status_and_a_sentence_of_its_own() {
        let mut codes: Vec<i32> = ExitClass::ALL.iter().map(|class| class.code()).collect();
        let count = codes.len();
        codes.sort_unstable();
        distinct_check(&codes, count);
        for class in ExitClass::ALL.iter().copied() {
            assert!(class.code() > 0, "{class:?} exits as a success");
            assert_ne!(
                class.code(),
                USAGE_EXIT_CODE,
                "{class:?} took the parser's status"
            );
            assert!(class.label().len() > 10, "{class:?} has no sentence");
        }
    }
}
