//! Provider specification: which dialect to speak, where, and how to
//! authenticate. Apps map their own provider enums/config onto [`ProviderSpec`]
//! at the boundary; this crate never resolves keys itself.

use std::fmt;

/// Whether a base URL targets an OpenAI-managed endpoint (the public API or the
/// ChatGPT/Codex backend). OpenAI deprecated `max_tokens` in favor of
/// `max_completion_tokens`, and reasoning-class models (o-series, gpt-5 family)
/// reject `max_tokens` outright with a 400. Third-party OpenAI-compatible
/// servers (xAI, DeepSeek, Mistral, OpenRouter, LM Studio, …) still expect the
/// legacy `max_tokens` field, so the detection is intentionally narrow.
pub fn is_openai_native_endpoint(url: &str) -> bool {
    url.contains("api.openai.com") || url.contains("chatgpt.com")
}

/// Dialect flags for OpenAI-compatible Chat Completions endpoints.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct OpenAiOpts {
    /// Send the output-token cap as `max_completion_tokens` (OpenAI-managed
    /// endpoints) instead of the legacy `max_tokens` (everyone else).
    pub use_max_completion_tokens: bool,
}

impl OpenAiOpts {
    /// Derive the option set from a chat-completions base URL, matching the
    /// CLI's historical URL-sniffing behavior.
    pub fn for_url(base_url: &str) -> Self {
        Self {
            use_max_completion_tokens: is_openai_native_endpoint(base_url),
        }
    }
}

/// Which provider wire dialect to speak.
///
/// Four dialects stay specialized because their API shapes differ
/// substantially from OpenAI Chat Completions: `Anthropic` (Messages API),
/// `Gemini` (Google generateContent), `OllamaNative` (newline-delimited JSON),
/// and `OpenAiResponses` (typed input Items + semantic SSE). Everything else
/// flows through `OpenAiCompat`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Dialect {
    Anthropic,
    Gemini,
    OllamaNative,
    /// OpenAI's native Responses API. This is deliberately distinct from
    /// OpenAI-compatible Chat Completions: request fields, function tools,
    /// usage, and streaming event schemas are not wire-compatible.
    OpenAiResponses,
    OpenAiCompat(OpenAiOpts),
}

/// How to authenticate a request. Key material is provided by the app (config,
/// vault, subscription exchange) as an opaque string; this crate only places
/// it on the wire.
///
/// SECURITY: `Debug` REDACTS all secret values so specs can be traced/logged
/// safely. Never put secrets in [`ProviderSpec::extra_headers`] — those are
/// logged verbatim.
#[derive(Clone, PartialEq, Eq)]
pub enum Auth {
    /// No auth header (local endpoints such as Ollama).
    None,
    /// `Authorization: Bearer <token>`.
    Bearer(String),
    /// A custom header, e.g. Anthropic's `x-api-key` or Google's
    /// `x-goog-api-key`.
    Header { name: String, value: String },
}

impl fmt::Debug for Auth {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Auth::None => f.write_str("Auth::None"),
            Auth::Bearer(_) => f.write_str("Auth::Bearer([redacted])"),
            Auth::Header { name, .. } => {
                write!(f, "Auth::Header {{ name: {name:?}, value: [redacted] }}")
            }
        }
    }
}

/// A fully-resolved provider endpoint: dialect + URL + auth + extra headers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderSpec {
    /// Display/log/error label (e.g. "openai", "anthropic", "copilot").
    /// May be empty for ad-hoc endpoints; error classification then falls back
    /// to URL-based inference.
    pub id: String,
    pub dialect: Dialect,
    /// Dialect-specific base URL:
    /// - Anthropic: the full Messages URL (e.g. `https://api.anthropic.com/v1/messages`)
    /// - Gemini: the API root (e.g. `https://generativelanguage.googleapis.com/v1beta`)
    /// - OllamaNative: the server root (e.g. `http://localhost:11434`)
    /// - OpenAiResponses: the full Responses URL (e.g. `https://api.openai.com/v1/responses`)
    /// - OpenAiCompat: the full chat-completions URL
    pub base_url: String,
    pub auth: Auth,
    /// Additional non-secret headers (subscription user-agents, intents,
    /// account ids). NEVER place key material here — values are not redacted.
    pub extra_headers: Vec<(String, String)>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openai_opts_for_url_matches_native_endpoints_only() {
        assert!(
            OpenAiOpts::for_url("https://api.openai.com/v1/chat/completions")
                .use_max_completion_tokens
        );
        assert!(
            OpenAiOpts::for_url("https://chatgpt.com/backend-api/codex/responses")
                .use_max_completion_tokens
        );
        assert!(
            !OpenAiOpts::for_url("https://api.deepseek.com/v1/chat/completions")
                .use_max_completion_tokens
        );
        assert!(
            !OpenAiOpts::for_url("http://localhost:1234/v1/chat/completions")
                .use_max_completion_tokens
        );
    }

    #[test]
    fn auth_debug_redacts_secrets() {
        let bearer = format!("{:?}", Auth::Bearer("sk-super-secret".into()));
        assert!(!bearer.contains("sk-super-secret"), "{bearer}");
        let header = format!(
            "{:?}",
            Auth::Header {
                name: "x-api-key".into(),
                value: "sk-ant-secret".into()
            }
        );
        assert!(header.contains("x-api-key"), "{header}");
        assert!(!header.contains("sk-ant-secret"), "{header}");
    }
}
