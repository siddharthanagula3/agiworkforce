//! Signature-preserving facade over the shared `agiworkforce-llm` provider
//! engine (Wave 5c1, `docs/plans/rust-engine-extraction-2026-07-09.md`).
//!
//! The provider MECHANICS — dialect request building, SSE/NDJSON decoding,
//! UTF-8 chunk reassembly, tool-call delta assembly, idle watchdog, and error
//! classification — live in `crates/agiworkforce-llm`. This module keeps the
//! CLI-side POLICY exactly where it was:
//!
//! - `stream_completion(...)` keeps its historical signature, so the agent
//!   loop, TUI, subagents, and memory pipeline are untouched by construction;
//! - provider selection + key resolution (`provider_dispatch`) and
//!   subscription auth (Copilot / ChatGPT) stay here — the crate receives
//!   opaque credentials via `ProviderSpec`;
//! - Ollama-local preflight (model availability, tool-support probing, the
//!   "running without tools" TUI notice) stays here — the crate has no TUI;
//! - crate `LlmError`s are mapped back onto `CliError` / the historical
//!   anyhow messages so retry/fallback matching in `agent/chat.rs` and all
//!   user-facing error text are byte-identical.

use anyhow::Result;
use reqwest::Client;
use std::collections::HashMap;

use agiworkforce_llm::{
    Auth, ChatOutcome, ChatRequest, Dialect, LlmError, OpenAiOpts, ProviderSpec, StreamEvent,
    stream_chat,
};

use crate::config::CliConfig;
use crate::errors::CliError;

use super::{
    CompletionResult, Message, OllamaMode, Provider, STREAM_IDLE_TIMEOUT, StreamCallback,
    ToolDefinition,
    provider_dispatch::{resolve_key, try_subscription_auth},
};

/// Last-known Ollama tool-support result per model id, so a transient `/api/show`
/// probe failure can fall back to the last successful check instead of silently
/// stripping every tool from the turn.
static OLLAMA_TOOL_SUPPORT: std::sync::OnceLock<std::sync::Mutex<HashMap<String, bool>>> =
    std::sync::OnceLock::new();

fn cache_ollama_tool_support(model: &str, supported: bool) {
    if let Ok(mut m) = OLLAMA_TOOL_SUPPORT
        .get_or_init(|| std::sync::Mutex::new(HashMap::new()))
        .lock()
    {
        m.insert(model.to_string(), supported);
    }
}

fn cached_ollama_tool_support(model: &str) -> Option<bool> {
    OLLAMA_TOOL_SUPPORT
        .get()
        .and_then(|m| m.lock().ok().and_then(|g| g.get(model).copied()))
}

/// Surface a "running this turn without tools" notice: into the TUI transcript
/// when the full-screen UI owns the terminal, else to stderr (a raw `eprintln!`
/// would corrupt the alternate screen, which is why the TUI path is separate).
fn notify_tools_dropped(model: &str, reason: &str) {
    let msg = format!("Local model '{model}': {reason}. Running this turn without tools.");
    if crate::tui::tui_active() {
        crate::tui::push_tui_notice(msg);
    } else {
        eprintln!("AGI: {msg}");
    }
}

/// Attempt to parse a paywall JSON body returned by the AGI Workforce managed-cloud
/// API (`/api/llm/v1/chat/completions`) when a user exceeds 150 % of their tier quota.
///
/// Expected shape: `{"kind":"paywall","feature":"chat","requiredTier":"hobby","reason":"..."}`
///
/// Returns `Some(CliError::Paywall {...})` when the body matches, `None` otherwise so
/// callers can fall back to the regular rate-limit error.
pub fn parse_paywall_body(body: &str) -> Option<CliError> {
    agiworkforce_llm::parse_paywall_body(body)
        .map(|pw| CliError::paywall(pw.feature, pw.required_tier, pw.reason))
}

// ---------------------------------------------------------------------------
// LlmError -> CliError / anyhow mapping
// ---------------------------------------------------------------------------

/// Map a crate error onto the CLI's historical error surface.
///
/// Structured variants become the equivalent `CliError` (preserving the
/// `downcast_ref::<CliError>()` retry/fallback contract in `agent/chat.rs`);
/// idle-timeout and mid-stream read errors stay plain anyhow errors with the
/// historical message text, which the fallback logic intentionally does NOT
/// retry or rotate on.
fn map_llm_error(err: LlmError) -> anyhow::Error {
    match err {
        LlmError::Api {
            provider,
            status,
            message,
        } => CliError::api(provider, status, message).into(),
        LlmError::Auth { provider, message } => CliError::auth(provider, message).into(),
        LlmError::RateLimited {
            provider,
            retry_after,
        } => CliError::rate_limited(provider, retry_after).into(),
        LlmError::Network { url, message } => CliError::network(url, message).into(),
        LlmError::ContextOverflow { model } => CliError::context_overflow(model, 0, 0).into(),
        LlmError::Paywall {
            feature,
            required_tier,
            reason,
        } => CliError::paywall(feature, required_tier, reason).into(),
        // "Streaming timed out: no data received for 5 minutes" for the CLI's
        // 300s window — same text as the historical `bail!`.
        err @ LlmError::IdleTimeout { .. } => anyhow::anyhow!("{err}"),
        // Historical shape: reqwest read error wrapped with this context.
        LlmError::Read { message } => anyhow::anyhow!(message).context("Error reading stream"),
    }
}

fn completion_result_from(outcome: ChatOutcome) -> CompletionResult {
    CompletionResult {
        text: outcome.text,
        tool_calls: outcome.tool_calls,
        input_tokens: outcome.usage.input_tokens,
        output_tokens: outcome.usage.output_tokens,
        cache_read_input_tokens: outcome.usage.cache_read_input_tokens,
        cache_creation_input_tokens: outcome.usage.cache_creation_input_tokens,
        via_subscription: false,
        stop_reason: outcome.stop_reason,
        reasoning_output_tokens: outcome.usage.reasoning_output_tokens,
    }
}

// ---------------------------------------------------------------------------
// Provider -> ProviderSpec mapping
// ---------------------------------------------------------------------------

fn anthropic_spec(api_key: &str) -> ProviderSpec {
    ProviderSpec {
        id: "anthropic".to_string(),
        dialect: Dialect::Anthropic,
        base_url: "https://api.anthropic.com/v1/messages".to_string(),
        auth: Auth::Header {
            name: "x-api-key".to_string(),
            value: api_key.to_string(),
        },
        extra_headers: Vec::new(),
    }
}

fn gemini_spec(api_key: &str) -> ProviderSpec {
    ProviderSpec {
        id: "google".to_string(),
        dialect: Dialect::Gemini,
        base_url: "https://generativelanguage.googleapis.com/v1beta".to_string(),
        auth: Auth::Header {
            name: "x-goog-api-key".to_string(),
            value: api_key.to_string(),
        },
        extra_headers: Vec::new(),
    }
}

fn ollama_spec(base_url: &str) -> ProviderSpec {
    ProviderSpec {
        id: "ollama".to_string(),
        dialect: Dialect::OllamaNative,
        base_url: base_url.to_string(),
        auth: Auth::None,
        extra_headers: Vec::new(),
    }
}

/// OpenAI-compatible spec. Note: the historical wire behavior sends an
/// `Authorization: Bearer` header even for keyless local endpoints (empty
/// token), so this always uses `Auth::Bearer`.
fn openai_compat_spec(name: &str, base_url: &str, api_key: &str) -> ProviderSpec {
    ProviderSpec {
        id: name.to_string(),
        dialect: Dialect::OpenAiCompat(OpenAiOpts::for_url(base_url)),
        base_url: base_url.to_string(),
        auth: Auth::Bearer(api_key.to_string()),
        extra_headers: Vec::new(),
    }
}

/// Subscription-auth specs (Copilot / ChatGPT Plus). Auth resolution happened
/// in `provider_dispatch::try_subscription_auth`; here we only attach the
/// provider-required extra headers.
fn subscription_spec(
    sub_name: &str,
    url: &str,
    token: &str,
    account_id: Option<&str>,
) -> ProviderSpec {
    match sub_name {
        "copilot" => {
            let mut spec = openai_compat_spec("copilot", url, token);
            spec.extra_headers = vec![
                (
                    "User-Agent".to_string(),
                    concat!("agiworkforce-cli/", env!("CARGO_PKG_VERSION")).to_string(),
                ),
                ("Openai-Intent".to_string(), "conversation-edits".to_string()),
                ("Copilot-Vision-Request".to_string(), "true".to_string()),
            ];
            spec
        }
        "chatgpt" => {
            let mut spec = openai_compat_spec("chatgpt", url, token);
            spec.extra_headers
                .push(("originator".to_string(), "agiworkforce".to_string()));
            if let Some(aid) = account_id {
                spec.extra_headers
                    .push(("ChatGPT-Account-Id".to_string(), aid.to_string()));
            }
            spec
        }
        other => openai_compat_spec(other, url, token),
    }
}

/// Run one spec through the shared engine, adapting `StreamEvent::TextDelta`
/// onto the CLI's `StreamCallback` and the crate outcome/error onto
/// `CompletionResult` / `CliError`.
#[allow(clippy::too_many_arguments)]
async fn run_spec(
    client: &Client,
    spec: &ProviderSpec,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
    thinking_budget: Option<u32>,
) -> Result<CompletionResult> {
    // Resolve the (possibly dotted display) model id to the provider wire id
    // (`apiModelId`) ONLY here, at the request boundary. This lets `-m
    // claude-haiku-4.5` (the id web/desktop/mobile use) work instead of 404ing;
    // display/pricing/provider-inference keep the dotted id. Unknown ids
    // (local/Ollama/custom) fall through unchanged.
    let wire_model = crate::model_catalog::api_wire_id(model);
    let req = ChatRequest {
        model: &wire_model,
        messages,
        max_tokens,
        temperature,
        tools,
        thinking_budget,
        idle_timeout: STREAM_IDLE_TIMEOUT,
    };
    let mut on_event = |event: StreamEvent| {
        if let StreamEvent::TextDelta { text } = event {
            on_chunk(&text);
        }
    };
    match stream_chat(client, spec, &req, &mut on_event).await {
        Ok(outcome) => Ok(completion_result_from(outcome)),
        Err(err) => Err(map_llm_error(err)),
    }
}

// ---------------------------------------------------------------------------
// Streaming completion (main entry point)
// ---------------------------------------------------------------------------

/// Send a streaming chat completion request and invoke `on_chunk` for each text delta.
/// Returns a `CompletionResult` with text, tool calls, and token usage.
#[allow(clippy::too_many_arguments)]
pub async fn stream_completion(
    config: &CliConfig,
    provider: &Provider,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    tools: Option<&[ToolDefinition]>,
    mut on_chunk: StreamCallback,
    thinking_budget: Option<u32>,
) -> Result<CompletionResult> {
    let client = Client::new();
    let temperature = config.default.temperature;

    // ---- Try subscription auth first (Copilot, ChatGPT Plus) ----
    if let Some((token, url, sub_name, account_id)) = try_subscription_auth(provider).await {
        let spec = subscription_spec(&sub_name, &url, &token, account_id.as_deref());
        let mut result = run_spec(
            &client,
            &spec,
            model,
            messages,
            max_tokens,
            temperature,
            tools,
            &mut on_chunk,
            None,
        )
        .await?;
        result.via_subscription = true;
        return Ok(result);
    }

    // ---- Fall through to API key auth ----
    let api_key = resolve_key(config, provider)?;
    let key = api_key.as_deref().unwrap_or_default();

    match provider {
        Provider::Anthropic => {
            run_spec(
                &client,
                &anthropic_spec(key),
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
                thinking_budget,
            )
            .await
        }
        Provider::Google => {
            run_spec(
                &client,
                &gemini_spec(key),
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
                None,
            )
            .await
        }
        Provider::Ollama(OllamaMode::Local) => {
            let base_url = config
                .base_url("ollama")
                .unwrap_or_else(|| "http://localhost:11434".to_string());
            crate::local_models::ensure_local_model_available(&client, "ollama", &base_url, model)
                .await?;
            let effective_tools = if let Some(tool_defs) = tools {
                if tool_defs.is_empty() {
                    None
                } else {
                    match crate::local_models::ollama_model_supports_tools(
                        &client, &base_url, model,
                    )
                    .await
                    {
                        Ok(true) => {
                            cache_ollama_tool_support(model, true);
                            Some(tool_defs)
                        }
                        Ok(false) => {
                            cache_ollama_tool_support(model, false);
                            notify_tools_dropped(model, "does not advertise tool support");
                            None
                        }
                        Err(error) => {
                            // A transient probe failure (Ollama busy/loading) must not
                            // strip tools the model is known to support — fall back to
                            // the last successful capability check.
                            match cached_ollama_tool_support(model) {
                                Some(true) => Some(tool_defs),
                                _ => {
                                    notify_tools_dropped(
                                        model,
                                        &format!("could not verify tool support ({error})"),
                                    );
                                    None
                                }
                            }
                        }
                    }
                }
            } else {
                None
            };
            run_spec(
                &client,
                &ollama_spec(&base_url),
                model,
                messages,
                max_tokens,
                temperature,
                effective_tools,
                &mut on_chunk,
                None,
            )
            .await
        }
        Provider::Ollama(OllamaMode::Cloud) => {
            let base_url = config
                .base_url("ollama-cloud")
                .unwrap_or_else(|| "https://api.ollama.com/v1".to_string());
            let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
            run_spec(
                &client,
                &openai_compat_spec("ollama-cloud", &url, key),
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
                None,
            )
            .await
        }
        Provider::OpenAICompatible { name, base_url, .. } => {
            if *name == "lmstudio" {
                crate::local_models::ensure_local_model_available(
                    &client, "lmstudio", base_url, model,
                )
                .await?;
            }
            run_spec(
                &client,
                &openai_compat_spec(name, base_url, key),
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
                None,
            )
            .await
        }
        Provider::Custom { name, base_url, .. } => {
            run_spec(
                &client,
                &openai_compat_spec(name, base_url, key),
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
                None,
            )
            .await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    // -- LlmError -> CliError mapping (the downcast contract the agent loop
    //    retry/fallback logic depends on) --

    #[test]
    fn map_rate_limited_preserves_variant_and_message() {
        let err = map_llm_error(LlmError::RateLimited {
            provider: "anthropic".into(),
            retry_after: Some(7),
        });
        let cli = err
            .downcast_ref::<CliError>()
            .expect("must downcast to CliError");
        assert!(cli.is_retryable());
        assert_eq!(cli.retry_delay(), Duration::from_secs(7));
        assert!(err.to_string().contains("Rate limited"), "{err}");
    }

    #[test]
    fn map_auth_preserves_variant_and_message() {
        let err = map_llm_error(LlmError::Auth {
            provider: "openai".into(),
            message: "invalid key".into(),
        });
        assert!(err.downcast_ref::<CliError>().is_some());
        assert!(
            err.to_string().contains("Authentication failed"),
            "{err}"
        );
    }

    #[test]
    fn map_api_preserves_status_and_provider_specific_text() {
        let llm = agiworkforce_llm::classify_error_response(
            "anthropic",
            "claude-test",
            529,
            None,
            "overloaded",
        );
        let err = map_llm_error(llm);
        assert!(
            err.to_string().contains("Anthropic is overloaded"),
            "{err}"
        );
    }

    #[test]
    fn map_context_overflow_matches_cli_variant() {
        let err = map_llm_error(LlmError::ContextOverflow {
            model: "gpt-test".into(),
        });
        let cli = err.downcast_ref::<CliError>().expect("CliError");
        assert!(cli.is_context_overflow());
    }

    #[test]
    fn map_idle_timeout_is_plain_anyhow_with_legacy_text() {
        let err = map_llm_error(LlmError::IdleTimeout {
            after: STREAM_IDLE_TIMEOUT,
        });
        // The historical `bail!` produced a plain anyhow error — NOT a
        // CliError — so retry/fallback logic must not see a CliError here.
        assert!(err.downcast_ref::<CliError>().is_none());
        assert_eq!(
            err.to_string(),
            "Streaming timed out: no data received for 5 minutes"
        );
    }

    #[test]
    fn map_read_error_keeps_legacy_context_text() {
        let err = map_llm_error(LlmError::Read {
            message: "connection reset by peer".into(),
        });
        assert!(err.downcast_ref::<CliError>().is_none());
        assert_eq!(err.to_string(), "Error reading stream");
        let chain: Vec<String> = err.chain().map(|c| c.to_string()).collect();
        assert!(
            chain.iter().any(|c| c.contains("connection reset by peer")),
            "root cause must stay in the chain: {chain:?}"
        );
    }

    // -- Paywall detection (CLI-facing wrapper) --

    #[test]
    fn parse_paywall_body_detects_paywall_json() {
        let body = r#"{"kind":"paywall","feature":"chat","requiredTier":"hobby","reason":"Monthly token quota exceeded (150%)"}"#;
        let result = parse_paywall_body(body);
        assert!(result.is_some(), "Should parse paywall body");
        let err = result.unwrap();
        assert!(err.is_paywall(), "Should return a Paywall error variant");
        // Verify the formatted message contains required tier and upgrade URL
        let msg = err.to_string();
        assert!(
            msg.contains("hobby"),
            "Message should contain required tier: {msg}"
        );
        assert!(
            msg.contains("agiworkforce.com/pricing"),
            "Message should contain pricing URL: {msg}"
        );
        assert!(
            msg.contains("Monthly token quota exceeded"),
            "Message should contain reason: {msg}"
        );
    }

    #[test]
    fn parse_paywall_body_returns_none_for_non_paywall_429() {
        // Generic rate-limit body from Anthropic
        let body = r#"{"error":{"type":"rate_limit_error","message":"Rate limit exceeded"}}"#;
        let result = parse_paywall_body(body);
        assert!(
            result.is_none(),
            "Non-paywall 429 should not parse as paywall"
        );
    }

    #[test]
    fn parse_paywall_body_returns_none_for_empty_body() {
        assert!(parse_paywall_body("").is_none());
        assert!(parse_paywall_body("null").is_none());
    }

    #[test]
    fn classified_managed_cloud_429_paywall_maps_to_cli_paywall() {
        let paywall_body = r#"{"kind":"paywall","feature":"chat","requiredTier":"pro","reason":"Pro features require upgrade"}"#;
        let llm = agiworkforce_llm::classify_error_response(
            "agiworkforce",
            "m",
            429,
            None,
            paywall_body,
        );
        let err = map_llm_error(llm);
        let cli = err.downcast_ref::<CliError>().expect("CliError");
        assert!(
            cli.is_paywall(),
            "429 + paywall body must map to CliError::Paywall"
        );
        assert_eq!(
            cli.exit_code(),
            78,
            "Paywall errors should exit with code 78 (EX_CONFIG)"
        );
    }

    #[test]
    fn classified_plain_429_maps_to_rate_limited() {
        let llm = agiworkforce_llm::classify_error_response(
            "agiworkforce",
            "m",
            429,
            None,
            r#"{"error":"rate limited"}"#,
        );
        let err = map_llm_error(llm);
        let cli = err.downcast_ref::<CliError>().expect("CliError");
        assert!(!cli.is_paywall(), "Plain 429 should NOT be Paywall");
        assert!(
            err.to_string().contains("Rate limited"),
            "Plain 429 should be rate-limited: {err}"
        );
    }

    #[test]
    fn paywall_exit_code_is_78() {
        let err = crate::errors::CliError::paywall("chat", "hobby", "quota exceeded");
        assert_eq!(err.exit_code(), 78);
    }

    #[test]
    fn non_paywall_exit_code_is_1() {
        let err = crate::errors::CliError::rate_limited("anthropic", None);
        assert_eq!(err.exit_code(), 1);
    }

    // -- Spec mapping --

    #[test]
    fn subscription_specs_carry_provider_headers() {
        let copilot = subscription_spec(
            "copilot",
            "https://api.githubcopilot.com/chat/completions",
            "tok",
            None,
        );
        assert_eq!(copilot.id, "copilot");
        let names: Vec<&str> = copilot
            .extra_headers
            .iter()
            .map(|(n, _)| n.as_str())
            .collect();
        assert_eq!(
            names,
            vec!["User-Agent", "Openai-Intent", "Copilot-Vision-Request"]
        );

        let chatgpt = subscription_spec(
            "chatgpt",
            "https://chatgpt.com/backend-api/codex/responses",
            "tok",
            Some("acct_1"),
        );
        assert!(
            matches!(&chatgpt.dialect, Dialect::OpenAiCompat(o) if o.use_max_completion_tokens),
            "chatgpt.com endpoint must use max_completion_tokens"
        );
        assert!(
            chatgpt
                .extra_headers
                .iter()
                .any(|(n, v)| n == "ChatGPT-Account-Id" && v == "acct_1")
        );
    }

    #[test]
    fn openai_compat_spec_sends_bearer_even_when_keyless() {
        // Historical wire behavior: LM Studio (keyless) still receives an
        // Authorization header with an empty Bearer token.
        let spec = openai_compat_spec("lmstudio", "http://localhost:1234/v1/chat/completions", "");
        assert_eq!(spec.auth, Auth::Bearer(String::new()));
        assert!(
            matches!(&spec.dialect, Dialect::OpenAiCompat(o) if !o.use_max_completion_tokens)
        );
    }

    #[test]
    fn anthropic_and_gemini_specs_use_expected_endpoints() {
        let a = anthropic_spec("k");
        assert_eq!(a.base_url, "https://api.anthropic.com/v1/messages");
        assert!(matches!(
            &a.auth,
            Auth::Header { name, .. } if name == "x-api-key"
        ));

        let g = gemini_spec("k");
        assert_eq!(
            g.base_url,
            "https://generativelanguage.googleapis.com/v1beta"
        );
        assert!(matches!(
            &g.auth,
            Auth::Header { name, .. } if name == "x-goog-api-key"
        ));
    }
}
