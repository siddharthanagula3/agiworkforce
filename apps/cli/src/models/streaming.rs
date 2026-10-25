//! Signature-preserving facade over the shared `agiworkforce-llm` provider
//! engine (Wave 5c1, `docs/plans/rust-engine-extraction-2026-07-09.md`).
//!
//! The provider MECHANICS, dialect request building, SSE/NDJSON decoding,
//! UTF-8 chunk reassembly, tool-call delta assembly, idle watchdog, and error
//! classification, live in `crates/agiworkforce-llm`. This module keeps the
//! CLI-side POLICY exactly where it was:
//!
//! - `stream_completion(...)` keeps its historical signature, so the agent
//!   loop, TUI, subagents, and memory pipeline are untouched by construction;
//! - provider selection + key resolution (`provider_dispatch`) and
//!   subscription auth (Copilot) stay here, the crate receives
//!   opaque credentials via `ProviderSpec`;
//! - Ollama-local preflight (model availability, tool-support probing, the
//!   "running without tools" TUI notice) stays here, the crate has no TUI;
//! - crate `LlmError`s are mapped back onto `CliError` / the historical
//!   anyhow messages so retry/fallback matching in `agent/chat.rs` and all
//!   user-facing error text are byte-identical.

use anyhow::Result;
use reqwest::Client;
use std::collections::HashMap;

use agiworkforce_llm::{
    stream_chat, Auth, ChatOutcome, ChatRequest, Dialect, LlmError, OpenAiOpts, ProviderSpec,
    StreamEvent, ToolChoice,
};

use crate::config::CliConfig;
use crate::errors::CliError;

use super::managed_approvals::{self, ManagedApprovalPause};
use super::{
    provider_dispatch::{resolve_key, try_subscription_auth},
    CompletionResult, ContentBlock, Message, MessageContent, OllamaMode, Provider, StreamCallback,
    ToolDefinition, STREAM_IDLE_TIMEOUT,
};

pub const WEB_SEARCH_TOOL: &str = "web_search";

const REQUIRED_SEARCH_NUDGE: &str = "This turn requires live web results. Call the web search tool before you answer, base the answer on what it returns, and cite the pages you used. Do not answer from memory alone, and do not tell the user to search for themselves. If a search returns nothing usable, say so plainly instead of substituting your own recollection.";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SearchStep {
    First,
    Continuation,
}

tokio::task_local! {
    static SEARCH_TURN: SearchStep;
}

tokio::task_local! {
    static SEARCH_OFFERED: ();
}

/// How web search reaches one provider call. Every call of a turn carries the
/// same tools and the same user message, so a search turn's later calls keep
/// the search tool and the nudge its first call sent; only the first call
/// forces the search.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SearchScope {
    Required,
    RequiredContinued,
    Offered,
    Off,
}

pub async fn search_scoped<F: std::future::Future>(scope: SearchScope, future: F) -> F::Output {
    match scope {
        SearchScope::Required => SEARCH_TURN.scope(SearchStep::First, future).await,
        SearchScope::RequiredContinued => SEARCH_TURN.scope(SearchStep::Continuation, future).await,
        SearchScope::Offered => SEARCH_OFFERED.scope((), future).await,
        SearchScope::Off => future.await,
    }
}

fn search_step() -> Option<SearchStep> {
    SEARCH_TURN.try_with(|step| *step).ok()
}

fn search_turn() -> bool {
    search_step() == Some(SearchStep::First)
}

fn within_search_turn() -> bool {
    search_step().is_some()
}

fn search_offered() -> bool {
    SEARCH_OFFERED.try_with(|_| ()).is_ok()
}

pub(crate) type ReasoningSink = std::sync::Arc<dyn Fn(&str) + Send + Sync>;

tokio::task_local! {
    static REASONING_SINK: ReasoningSink;
}

/// Runs `future` with the model's reasoning summary streamed to `sink`, apart
/// from the answer text `on_chunk` receives.
pub(crate) async fn showing_reasoning<F: std::future::Future>(
    sink: ReasoningSink,
    future: F,
) -> F::Output {
    REASONING_SINK.scope(sink, future).await
}

fn show_reasoning(text: &str) {
    if text.is_empty() {
        return;
    }
    let _ = REASONING_SINK.try_with(|sink| sink(text));
}

tokio::task_local! {
    static ROUTING_PROFILE: &'static str;
}

pub(crate) async fn routed<F: std::future::Future>(
    profile: Option<&'static str>,
    future: F,
) -> F::Output {
    match profile {
        Some(profile) => ROUTING_PROFILE.scope(profile, future).await,
        None => future.await,
    }
}

fn routing_profile() -> Option<&'static str> {
    ROUTING_PROFILE.try_with(|profile| *profile).ok()
}

fn carries_only_tool_results(message: &Message) -> bool {
    matches!(&message.content, MessageContent::Blocks(blocks)
        if !blocks.is_empty()
            && blocks.iter().all(|block| matches!(block, ContentBlock::ToolResult { .. })))
}

fn with_search_nudge(messages: &[Message]) -> Vec<Message> {
    let mut nudged = messages.to_vec();
    if let Some(last_user) = nudged
        .iter_mut()
        .rev()
        .find(|message| message.role == "user" && !carries_only_tool_results(message))
    {
        match &mut last_user.content {
            MessageContent::Text(text) => {
                text.push_str("\n\n");
                text.push_str(REQUIRED_SEARCH_NUDGE);
            }
            MessageContent::Blocks(blocks) => blocks.push(ContentBlock::Text {
                text: REQUIRED_SEARCH_NUDGE.to_string(),
            }),
        }
    }
    nudged
}

/// Deadline for establishing a provider connection.
///
/// The engine's idle watchdog is constructed only after `send()` returns
/// headers, so before this bound existed a host that blackholes SYNs, a
/// captive portal, a dropped VPN, a firewalled egress, left the turn on the
/// spinner for the OS connect timeout with no diagnostic.
const PROVIDER_CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

/// The one client every provider request goes through.
///
/// Built once: `stream_completion` used to construct a fresh `Client` per call,
/// which discards connection pooling and TLS session reuse on every tool-loop
/// continuation. The read deadline mirrors the engine's idle watchdog rather
/// than introducing a second bound, and there is deliberately no overall
/// request timeout, a streaming turn's total duration is legitimately
/// unbounded, so `.timeout()` here would cut long answers off mid-stream.
fn provider_client() -> &'static Client {
    static CLIENT: std::sync::OnceLock<Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .connect_timeout(PROVIDER_CONNECT_TIMEOUT)
            .read_timeout(STREAM_IDLE_TIMEOUT)
            .build()
            .unwrap_or_else(|_| Client::new())
    })
}

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

const QUOTA_WARNING_EVENT: &str = "quota_warning";
const USAGE_CREDITS_SCOPE: &str = "usage_credits";
const USAGE_CREDITS_NOTICE: &str = "Now using usage credits. Your plan limit is reached, so messages are billed to your credits. Run `agi usage` to see your balance.";

static LAST_QUOTA_WARNING: std::sync::Mutex<Option<(String, String)>> = std::sync::Mutex::new(None);

fn quota_warning_scope_label(scope: &str) -> Option<&'static str> {
    match scope {
        "rolling_five_hour" => Some("5-hour window"),
        "rolling_weekly" => Some("weekly allowance"),
        "billing_period" => Some("monthly allowance"),
        _ => None,
    }
}

struct QuotaWarning {
    scope: String,
    level: String,
    notice: String,
}

fn quota_warning(data: &serde_json::Value) -> Option<QuotaWarning> {
    let header = data.get("value").and_then(|value| value.as_str())?;
    let fields: HashMap<&str, &str> = header
        .split(';')
        .filter_map(|part| part.split_once('='))
        .map(|(key, value)| (key.trim(), value.trim()))
        .collect();
    let level = fields.get("level").copied()?;
    let scope = fields.get("scope").copied()?;
    if scope == USAGE_CREDITS_SCOPE {
        return Some(QuotaWarning {
            scope: scope.to_string(),
            level: level.to_string(),
            notice: USAGE_CREDITS_NOTICE.to_string(),
        });
    }
    let used = fields
        .get("used_percent")
        .and_then(|value| value.parse::<u32>().ok())?;
    let window = quota_warning_scope_label(scope)?;
    Some(QuotaWarning {
        scope: scope.to_string(),
        level: level.to_string(),
        notice: format!(
            "You have used {}% of your {window}. Run `agi usage` to see what is left.",
            used.min(100)
        ),
    })
}

fn notify_quota_warning(data: &serde_json::Value) {
    let Some(warning) = quota_warning(data) else {
        return;
    };
    let key = (warning.scope, warning.level);
    let Ok(mut last) = LAST_QUOTA_WARNING.lock() else {
        return;
    };
    if last.as_ref() == Some(&key) {
        return;
    }
    *last = Some(key);
    drop(last);
    if crate::tui::tui_active() {
        crate::tui::push_tui_notice(warning.notice);
    } else {
        eprintln!("AGI: {}", warning.notice);
    }
}

async fn with_usage_limit_context(error: anyhow::Error, jwt: &str) -> anyhow::Error {
    let code = match error.downcast_ref::<CliError>() {
        Some(CliError::UsageLimit { code, .. }) => code.clone(),
        _ => return error,
    };
    let context = crate::usage_summary::usage_limit_context(jwt, &code).await;
    match error.downcast::<CliError>() {
        Ok(CliError::UsageLimit {
            code,
            message,
            recovery_href,
            retry_after,
            ..
        }) => CliError::UsageLimit {
            code,
            message,
            recovery_href,
            retry_after,
            resets_in: context.resets_in,
            resets_at: context.resets_at,
            alternative_model: context.alternative_model,
        }
        .into(),
        Ok(other) => other.into(),
        Err(error) => error,
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
        LlmError::StreamError {
            provider,
            message,
            retryable,
            detail,
        } => CliError::stream_failure(provider, message, retryable, detail).into(),
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
        LlmError::UsageLimit {
            code,
            message,
            recovery_href,
            retry_after,
            ..
        } => CliError::usage_limit(code, message, recovery_href, retry_after).into(),
        LlmError::UnsupportedInput { provider, message } => CliError::stream_failure(
            provider,
            message,
            false,
            agiworkforce_llm::StreamFailureDetail {
                code: Some("unsupported_attachment".to_string()),
                ..agiworkforce_llm::StreamFailureDetail::default()
            },
        )
        .into(),
        // "Streaming timed out: no data received for 5 minutes" for the CLI's
        // 300s window, same text as the historical `bail!`.
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
        stop: outcome.stop,
        reasoning_output_tokens: outcome.usage.reasoning_output_tokens,
        managed_request_id: None,
        resolved_model: None,
    }
}

fn managed_request_id(spec: &ProviderSpec) -> Option<String> {
    spec.extra_headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("Idempotency-Key"))
        .map(|(_, value)| value.clone())
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
        extra_body: Vec::new(),
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
        extra_body: Vec::new(),
    }
}

fn ollama_spec(base_url: &str) -> ProviderSpec {
    ProviderSpec {
        id: "ollama".to_string(),
        dialect: Dialect::OllamaNative,
        base_url: base_url.to_string(),
        auth: Auth::None,
        extra_headers: Vec::new(),
        extra_body: Vec::new(),
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
        extra_body: Vec::new(),
    }
}

/// Build the AGI managed-cloud transport without conflating the gateway with
/// the selected upstream provider. The caller-supplied base is validated by
/// the same host allowlist used by tier lookup before the Bearer token can be
/// attached, closing the configuration-based credential-exfiltration path.
fn managed_cloud_url_for_base(raw_base: &str, path: &str) -> Result<String> {
    let base = crate::tier_cache::resolve_agi_api_base(raw_base).ok_or_else(|| {
        CliError::config("Managed cloud requires a trusted AGI Workforce HTTPS host.".to_string())
    })?;
    let base = base.trim_end_matches('/');
    Ok(if base.ends_with("/api") {
        format!("{base}/{path}")
    } else {
        format!("{base}/api/{path}")
    })
}

fn managed_cloud_raw_base() -> String {
    std::env::var("AGIWORKFORCE_API_BASE")
        .unwrap_or_else(|_| "https://agiworkforce.com".to_string())
}

#[cfg(feature = "voice")]
pub(crate) fn managed_cloud_url(path: &str) -> Result<String> {
    managed_cloud_url_for_base(&managed_cloud_raw_base(), path)
}

pub(crate) fn managed_cloud_client_headers() -> Vec<(String, String)> {
    crate::cloud::handshake::headers()
        .into_iter()
        .map(|(name, value)| (name.to_string(), value.to_string()))
        .chain([("X-Requested-With".to_string(), "XMLHttpRequest".to_string())])
        .collect()
}

fn managed_cloud_spec_for_base(jwt: &str, raw_base: &str) -> Result<ProviderSpec> {
    let endpoint = managed_cloud_url_for_base(raw_base, "llm/v1/chat/completions")?;

    Ok(ProviderSpec {
        id: "managed_cloud".to_string(),
        dialect: Dialect::OpenAiCompat(OpenAiOpts::for_url(&endpoint)),
        base_url: endpoint,
        auth: Auth::Bearer(jwt.to_string()),
        // Managed Cloud refuses a request that does not name its client
        // surface, and refuses one with no idempotency key. The key is minted
        // per spec, so only a transport retry inside one call reuses it. A
        // retried turn builds a new spec and a new key: the server answers a
        // reused key whose request has ended with 409 rather than a replay.
        extra_headers: managed_cloud_client_headers()
            .into_iter()
            .chain([(
                "Idempotency-Key".to_string(),
                format!("agi.cli.chat.{}", uuid::Uuid::new_v4()),
            )])
            .collect(),
        extra_body: crate::cloud::bound_conversation()
            .map(|conversation_id| {
                (
                    "conversation_id".to_string(),
                    serde_json::Value::String(conversation_id),
                )
            })
            .into_iter()
            .chain(
                (within_search_turn() || search_offered())
                    .then(|| ("web_search".to_string(), serde_json::Value::Bool(true))),
            )
            .chain(search_turn().then(|| {
                (
                    "search_requested".to_string(),
                    serde_json::Value::Bool(true),
                )
            }))
            .chain(routing_profile().map(|profile| {
                (
                    "routing_profile".to_string(),
                    serde_json::Value::String(profile.to_string()),
                )
            }))
            .chain([(
                "use_prompt_cache".to_string(),
                serde_json::Value::Bool(true),
            )])
            .collect(),
    })
}

/// The `effort` field Managed Cloud reads. The OpenAI-compatible body carries
/// no effort of its own, so without this the picker never reaches the server.
fn managed_effort_field(
    model: &str,
    effort: Option<crate::design_system::Effort>,
) -> Vec<(String, serde_json::Value)> {
    let Some(requested) = effort.map(crate::design_system::Effort::wire_value) else {
        return Vec::new();
    };
    let (value, reasons) = match crate::model_catalog::effort_support(model) {
        crate::model_catalog::EffortSupport::Unsupported => return Vec::new(),
        crate::model_catalog::EffortSupport::Levels(levels) => {
            match crate::model_catalog::nearest_supported_effort(requested, &levels) {
                Some(level) => (level.to_string(), true),
                None => return Vec::new(),
            }
        }
        crate::model_catalog::EffortSupport::Any => (requested.to_string(), true),
        crate::model_catalog::EffortSupport::NotInCatalog => (requested.to_string(), false),
    };
    let mut fields = vec![("effort".to_string(), serde_json::Value::String(value))];
    // The server leaves Anthropic thinking unset unless asked, so a chosen
    // effort reached the model without thinking switched on.
    if reasons && !matches!(requested, "none" | "minimal") {
        fields.push(("thinking_mode".to_string(), serde_json::Value::Bool(true)));
    }
    fields
}

fn managed_cloud_spec(jwt: &str) -> Result<ProviderSpec> {
    managed_cloud_spec_for_base(jwt, &managed_cloud_raw_base())
}

/// Subscription-auth specs (Copilot). Auth resolution happened
/// in `provider_dispatch::try_subscription_auth`; here we only attach the
/// provider-required extra headers.
fn subscription_spec(sub_name: &str, url: &str, token: &str) -> ProviderSpec {
    match sub_name {
        "copilot" => {
            let mut spec = openai_compat_spec("copilot", url, token);
            spec.extra_headers = vec![
                (
                    "User-Agent".to_string(),
                    concat!("agiworkforce-cli/", env!("CARGO_PKG_VERSION")).to_string(),
                ),
                (
                    "Openai-Intent".to_string(),
                    "conversation-edits".to_string(),
                ),
                ("Copilot-Vision-Request".to_string(), "true".to_string()),
            ];
            spec
        }
        other => openai_compat_spec(other, url, token),
    }
}

/// Temperature to actually put in the request body for `model`.
///
/// `stream_completion` forwards `config.default.temperature` (set by
/// `--temperature` or `[default] temperature` in the config file) untouched, and
/// `agiworkforce-llm` serializes it verbatim for the Anthropic, OpenAI, Gemini
/// and Ollama dialects (`crates/agiworkforce-llm/src/stream.rs:342,725,988,1397`).
/// Models whose provider rejects sampling parameters therefore 400 on any
/// configured temperature. The set is declared once, in models.json
/// (`reasoning.rejectsSamplingParameters`), never as an ID list at a call
/// site. This is the CLI's copy of the boundary the desktop request builder
/// already applies in `core/llm/provider_adapter.rs`.
fn effective_temperature(model: &str, requested: Option<f32>) -> Option<f32> {
    if crate::model_catalog::model_rejects_sampling_parameters(model) {
        return None;
    }
    requested
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
    effort: Option<crate::design_system::Effort>,
) -> Result<CompletionResult> {
    run_spec_observing(
        client,
        spec,
        model,
        messages,
        max_tokens,
        temperature,
        tools,
        on_chunk,
        thinking_budget,
        effort,
        None,
    )
    .await
}

/// The Messages API thinking mode, `output_config.effort` and legacy budget
/// for one request. A model the catalog gives an effort control reasons at the
/// chosen level; a token budget is the 400 such a model returns.
fn messages_reasoning_controls(
    dialect: &Dialect,
    model: &str,
    effort: Option<crate::design_system::Effort>,
    thinking_budget: Option<u32>,
) -> (
    Option<agiworkforce_llm::AnthropicThinking>,
    Option<&'static str>,
    Option<u32>,
) {
    match (
        dialect,
        crate::model_catalog::messages_effort(model),
        effort,
    ) {
        (
            Dialect::Anthropic,
            crate::model_catalog::MessagesEffort::OutputConfig {
                levels,
                adaptive_thinking,
            },
            Some(effort),
        ) => (
            adaptive_thinking.then_some(agiworkforce_llm::AnthropicThinking::Adaptive),
            crate::model_catalog::nearest_supported_effort(effort.wire_value(), levels),
            None,
        ),
        _ => (None, None, thinking_budget),
    }
}

/// The `thinking.display` the catalog declares for a Messages API model, so a
/// model whose thinking blocks stream empty by default returns a readable
/// summary. A model that thinks unasked is asked for adaptive thinking, the
/// mode it already runs, so the display has a mode to ride on.
fn with_thinking_display(
    dialect: &Dialect,
    model: &str,
    thinking: Option<agiworkforce_llm::AnthropicThinking>,
    thinking_budget: Option<u32>,
) -> (
    Option<agiworkforce_llm::AnthropicThinking>,
    Option<&'static str>,
) {
    let display = match dialect {
        Dialect::Anthropic => crate::model_catalog::thinking_display(model),
        _ => None,
    };
    let Some(display) = display else {
        return (thinking, None);
    };
    let thinking = match thinking {
        None if thinking_budget.is_none() && display.thinks_by_default => {
            Some(agiworkforce_llm::AnthropicThinking::Adaptive)
        }
        requested => requested,
    };
    (thinking, Some(display.value))
}

#[allow(clippy::too_many_arguments)]
async fn run_spec_observing(
    client: &Client,
    spec: &ProviderSpec,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
    thinking_budget: Option<u32>,
    effort: Option<crate::design_system::Effort>,
    pause: Option<&mut ManagedApprovalPause>,
) -> Result<CompletionResult> {
    // Resolve the (possibly dotted display) model id to the provider wire id
    // (`apiModelId`) ONLY here, at the request boundary. This lets a canonical
    // catalog selection work even when its provider wire ID differs;
    // display/pricing/provider-inference keep the dotted id. Unknown ids
    // (local/Ollama/custom) fall through unchanged.
    let wire_model = if spec.id == super::provider_name(&Provider::ManagedCloud) {
        crate::model_catalog::canonical_model_id(model)
    } else {
        crate::model_catalog::api_wire_id(model)
    };
    let support = crate::model_catalog::effort_support(model);
    let (effort, thinking_budget) = match support {
        crate::model_catalog::EffortSupport::Unsupported => (None, None),
        _ => (effort, thinking_budget),
    };
    let reasoning_effort = match (&support, effort) {
        (crate::model_catalog::EffortSupport::Levels(levels), Some(effort)) => {
            crate::model_catalog::nearest_supported_effort(effort.wire_value(), levels)
        }
        (_, effort) => effort.map(|e| e.openai_effort_str()),
    };
    let (anthropic_thinking, anthropic_effort, thinking_budget) =
        messages_reasoning_controls(&spec.dialect, model, effort, thinking_budget);
    let (anthropic_thinking, thinking_display) =
        with_thinking_display(&spec.dialect, model, anthropic_thinking, thinking_budget);
    let searching = within_search_turn()
        && spec.id != super::provider_name(&Provider::ManagedCloud)
        && tools.is_some_and(|tools| tools.iter().any(|tool| tool.name == WEB_SEARCH_TOOL));
    let forced_search = searching
        && crate::model_catalog::accepts_forced_tool_choice(model)
        && !(matches!(spec.dialect, Dialect::Anthropic)
            && (thinking_budget.is_some() || anthropic_thinking.is_some()));
    let nudged;
    let messages = if searching && !forced_search {
        nudged = with_search_nudge(messages);
        nudged.as_slice()
    } else {
        messages
    };
    let req = ChatRequest {
        model: &wire_model,
        messages,
        max_tokens,
        temperature: effective_temperature(model, temperature),
        tools,
        thinking_budget,
        tool_choice: (forced_search && search_turn())
            .then(|| ToolChoice::Specific(WEB_SEARCH_TOOL.to_string())),
        anthropic_thinking,
        thinking_display,
        effort: anthropic_effort,
        top_p: None,
        top_k: None,
        metadata: None,
        // The Effort picker used to be projected to an Anthropic thinking
        // budget and nothing else, so catalog reasoning models silently ran at
        // provider default no matter what the user chose. Each dialect reads
        // only its own field and ignores the others, so all three are passed.
        reasoning_effort,
        gemini_thinking_budget: effort.map(|e| e.gemini_thinking_budget()),
        num_ctx: None,
        ollama_think: None,
        idle_timeout: STREAM_IDLE_TIMEOUT,
    };
    let mut resolved_model = None;
    let mut thinking =
        (spec.id == super::provider_name(&Provider::ManagedCloud)).then(InlineThinking::default);
    let mut on_event =
        stream_event_handler(on_chunk, pause, &mut resolved_model, thinking.as_mut());
    let outcome = stream_chat(client, spec, &req, &mut on_event).await;
    drop(on_event);
    if let Some(rest) = thinking.as_mut().map(InlineThinking::finish) {
        if !rest.is_empty() {
            on_chunk(&rest);
        }
    }
    match outcome {
        Ok(outcome) => Ok(CompletionResult {
            resolved_model,
            ..managed_visible(completion_result_from(outcome), thinking.is_some())
        }),
        Err(err) => Err(map_llm_error(err)),
    }
}

/// The managed gateway inlines the reasoning summary between these tags in the
/// answer text, where it would be printed, kept and synced as the answer.
#[derive(Debug, Default)]
struct InlineThinking {
    held: String,
    inside: bool,
}

const THINKING_OPEN: &str = "<thinking>";
const THINKING_CLOSE: &str = "</thinking>";

/// A tag can arrive split across two chunks.
fn partial_tag_len(text: &str, tag: &str) -> usize {
    (1..tag.len().min(text.len() + 1))
        .rev()
        .find(|length| {
            text.is_char_boundary(text.len() - length) && text.ends_with(&tag[..*length])
        })
        .unwrap_or(0)
}

impl InlineThinking {
    fn push(&mut self, chunk: &str) -> String {
        self.split(chunk).0
    }

    /// The answer text and the reasoning summary in `chunk`, in that order.
    fn split(&mut self, chunk: &str) -> (String, String) {
        self.held.push_str(chunk);
        let mut visible = String::new();
        let mut reasoning = String::new();
        loop {
            let tag = if self.inside {
                THINKING_CLOSE
            } else {
                THINKING_OPEN
            };
            if let Some(at) = self.held.find(tag) {
                if self.inside {
                    reasoning.push_str(&self.held[..at]);
                } else {
                    visible.push_str(&self.held[..at]);
                }
                self.held.drain(..at + tag.len());
                self.inside = !self.inside;
                continue;
            }
            let keep = partial_tag_len(&self.held, tag);
            let cut = self.held.len() - keep;
            if self.inside {
                reasoning.push_str(&self.held[..cut]);
            } else {
                visible.push_str(&self.held[..cut]);
            }
            self.held.drain(..cut);
            return (visible, reasoning);
        }
    }

    fn finish(&mut self) -> String {
        let rest = if self.inside {
            String::new()
        } else {
            std::mem::take(&mut self.held)
        };
        self.held.clear();
        rest
    }
}

fn managed_visible(mut result: CompletionResult, managed: bool) -> CompletionResult {
    if managed {
        let mut thinking = InlineThinking::default();
        let mut text = thinking.push(&result.text);
        text.push_str(&thinking.finish());
        result.text = text;
    }
    result
}

const AGENT_EVENT: &str = "x_agent_event";
const REASONING_DELTA: &str = "reasoning-delta";

/// The reasoning summary an `x_agent_event` frame carries, if it is one.
fn agent_reasoning_delta(data: &serde_json::Value) -> Option<&str> {
    let event = data.get("event")?;
    if event.get("type").and_then(serde_json::Value::as_str) != Some(REASONING_DELTA) {
        return None;
    }
    event.get("delta").and_then(serde_json::Value::as_str)
}

/// The managed gateway can send one reasoning summary twice: inline between
/// thinking tags in the answer text and as its own agent event. Each copy is
/// followed on its own, and only what neither has shown yet is passed on.
#[derive(Default)]
struct ReasoningRelay {
    inline: String,
    events: String,
}

enum ReasoningSource {
    Inline,
    Event,
}

impl ReasoningRelay {
    fn unseen(&mut self, source: ReasoningSource, text: &str) -> String {
        let (mine, other) = match source {
            ReasoningSource::Inline => (&mut self.inline, self.events.as_str()),
            ReasoningSource::Event => (&mut self.events, self.inline.as_str()),
        };
        let before = mine.len();
        mine.push_str(text);
        if other.starts_with(mine.as_str()) {
            return String::new();
        }
        if mine.starts_with(other) {
            return mine[before.max(other.len())..].to_string();
        }
        text.to_string()
    }
}

fn stream_event_handler<'a>(
    on_chunk: &'a mut StreamCallback,
    mut pause: Option<&'a mut ManagedApprovalPause>,
    resolved_model: &'a mut Option<String>,
    mut thinking: Option<&'a mut InlineThinking>,
) -> impl FnMut(StreamEvent) + Send + 'a {
    let mut relay = ReasoningRelay::default();
    move |event| match event {
        StreamEvent::TextDelta { text } => match thinking.as_deref_mut() {
            Some(thinking) => {
                let (visible, reasoning) = thinking.split(&text);
                show_reasoning(&relay.unseen(ReasoningSource::Inline, &reasoning));
                if !visible.is_empty() {
                    on_chunk(&visible);
                }
            }
            None => on_chunk(&text),
        },
        StreamEvent::ReasoningDelta { text } => show_reasoning(&text),
        StreamEvent::Vendor { event, data } if event == AGENT_EVENT => {
            if let Some(delta) = agent_reasoning_delta(&data) {
                show_reasoning(&relay.unseen(ReasoningSource::Event, delta));
            }
            if let Some(pause) = pause.as_deref_mut() {
                pause.observe(&event, &data);
            }
        }
        StreamEvent::Vendor { event, data } if event == QUOTA_WARNING_EVENT => {
            notify_quota_warning(&data)
        }
        StreamEvent::Vendor { event, data } if event == agiworkforce_llm::RESOLVED_MODEL_EVENT => {
            *resolved_model = data
                .get("value")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|model| !model.is_empty())
                .map(str::to_string);
        }
        StreamEvent::Vendor { event, data } if event == crate::sources::SEARCH_RESULTS_EVENT => {
            crate::sources::record(crate::sources::from_search_results_delta(&data))
        }
        StreamEvent::Vendor { event, data }
            if event == crate::cloud::connectors::TOOL_RESULT_EVENT =>
        {
            crate::cloud::connectors::observe_tool_result(&data)
        }
        StreamEvent::Vendor { event, data } => {
            if let Some(pause) = pause.as_deref_mut() {
                pause.observe(&event, &data);
            }
        }
        _ => {}
    }
}

fn hosted_conversation_missing(error: &anyhow::Error) -> bool {
    matches!(
        error.downcast_ref::<CliError>(),
        Some(CliError::Api { status: 404, message, .. }) if message.contains("Conversation not found")
    )
}

fn managed_approval_resume_spec(jwt: &str) -> Result<ProviderSpec> {
    let mut spec = managed_cloud_spec(jwt)?;
    spec.base_url.push_str("/approve");
    for (name, value) in &mut spec.extra_headers {
        if name.eq_ignore_ascii_case("Idempotency-Key") {
            *value = format!("agi.cli.tool-resume.{}", uuid::Uuid::new_v4());
        }
    }
    Ok(spec)
}

fn absorb_continuation(completed: &mut CompletionResult, next: CompletionResult) {
    completed.text.push_str(&next.text);
    completed.tool_calls.extend(next.tool_calls);
    completed.input_tokens += next.input_tokens;
    completed.output_tokens += next.output_tokens;
    completed.cache_read_input_tokens += next.cache_read_input_tokens;
    completed.cache_creation_input_tokens += next.cache_creation_input_tokens;
    completed.reasoning_output_tokens += next.reasoning_output_tokens;
    completed.stop_reason = next.stop_reason;
    completed.stop = next.stop;
    if next.resolved_model.is_some() {
        completed.resolved_model = next.resolved_model;
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_managed_cloud(
    client: &Client,
    jwt: &str,
    raw_base: &str,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
    thinking_budget: Option<u32>,
    effort: Option<crate::design_system::Effort>,
) -> Result<CompletionResult> {
    let effort_field = managed_effort_field(model, effort);
    let mut spec = managed_cloud_spec_for_base(jwt, raw_base)?;
    spec.extra_body.extend(effort_field.clone());
    let mut pause = ManagedApprovalPause::default();
    let abandoned = AbandonedRunCancel {
        client: client.clone(),
        jwt: jwt.to_string(),
        raw_base: raw_base.to_string(),
        run: pause.announced_run(),
        armed: true,
    };
    let mut completed = match run_spec_observing(
        client,
        &spec,
        model,
        messages,
        max_tokens,
        temperature,
        tools,
        on_chunk,
        thinking_budget,
        effort,
        Some(&mut pause),
    )
    .await
    {
        Err(error)
            if spec
                .extra_body
                .iter()
                .any(|(key, _)| key == "conversation_id")
                && hosted_conversation_missing(&error) =>
        {
            if let Some(conversation_id) = crate::cloud::bound_conversation() {
                crate::cloud::forget_hosted_conversation(&conversation_id);
            }
            spec = managed_cloud_spec_for_base(jwt, raw_base)?;
            spec.extra_body.retain(|(key, _)| key != "conversation_id");
            spec.extra_body.extend(effort_field);
            run_spec_observing(
                client,
                &spec,
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                on_chunk,
                thinking_budget,
                effort,
                Some(&mut pause),
            )
            .await?
        }
        result => result?,
    };
    completed.managed_request_id = managed_request_id(&spec);
    while let Some((run_id, calls)) = pause.take_pending()? {
        let decisions = managed_approvals::decide(&calls).await;
        let body = serde_json::json!({ "run_id": run_id, "tool_approvals": decisions });
        let mut resolved_model = None;
        let mut thinking = InlineThinking::default();
        let mut on_event = stream_event_handler(
            on_chunk,
            Some(&mut pause),
            &mut resolved_model,
            Some(&mut thinking),
        );
        let next = agiworkforce_llm::post_openai_compat_stream(
            client,
            &managed_approval_resume_spec(jwt)?,
            &body,
            model,
            STREAM_IDLE_TIMEOUT,
            &mut on_event,
        )
        .await;
        drop(on_event);
        let rest = thinking.finish();
        if !rest.is_empty() {
            on_chunk(&rest);
        }
        let next = next.map_err(map_llm_error)?;
        absorb_continuation(
            &mut completed,
            CompletionResult {
                resolved_model,
                ..managed_visible(completion_result_from(next), true)
            },
        );
    }
    abandoned.disarm();
    Ok(completed)
}

/// Stops the server's run when a managed turn ends without completing, as a
/// Stop does on web and mobile. Dropping the stream alone leaves the run
/// generating, and billing, up to its output cap.
struct AbandonedRunCancel {
    client: Client,
    jwt: String,
    raw_base: String,
    run: std::sync::Arc<std::sync::Mutex<Option<String>>>,
    armed: bool,
}

impl AbandonedRunCancel {
    fn disarm(mut self) {
        self.armed = false;
    }
}

impl Drop for AbandonedRunCancel {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        let Some(run_id) = self.run.lock().ok().and_then(|run| run.clone()) else {
            return;
        };
        if run_id.is_empty()
            || !run_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            tracing::warn!("managed run id is not a path segment; the run was not cancelled");
            return;
        }
        let Ok(runtime) = tokio::runtime::Handle::try_current() else {
            return;
        };
        let url = match managed_cloud_url_for_base(
            &self.raw_base,
            &format!("llm/v1/chat/completions/runs/{run_id}"),
        ) {
            Ok(url) => url,
            Err(error) => {
                tracing::warn!(%error, "could not address the managed run to cancel it");
                return;
            }
        };
        let client = self.client.clone();
        let jwt = self.jwt.clone();
        runtime.spawn(async move {
            let request = managed_cloud_client_headers()
                .into_iter()
                .fold(client.post(&url).bearer_auth(jwt), |request, (name, value)| {
                    request.header(name, value)
                });
            match request.send().await {
                Ok(response) if response.status().is_success() => {}
                Ok(response) => {
                    tracing::warn!(status = %response.status(), "the server refused to cancel an abandoned managed run");
                }
                Err(error) => {
                    tracing::warn!(%error, "could not reach the server to cancel an abandoned managed run");
                }
            }
        });
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
    effort: Option<crate::design_system::Effort>,
) -> Result<CompletionResult> {
    let client = provider_client().clone();
    let temperature = config.default.temperature;

    // ---- Try subscription auth first (Copilot) ----
    if let Some((token, url, sub_name)) = try_subscription_auth(provider).await {
        let spec = subscription_spec(&sub_name, &url, &token);
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
            effort,
        )
        .await?;
        result.via_subscription = true;
        return Ok(result);
    }

    // ---- Fall through to API key auth ----
    let api_key = resolve_key(config, provider).map_err(|error| {
        match super::provider_dispatch::resolve_turn_route(
            config,
            &super::AccountRoute::load(),
            model,
            None,
        ) {
            Ok(_) => error,
            Err(account) => account,
        }
    })?;
    let key = api_key.as_deref().unwrap_or_default();

    match provider {
        Provider::ManagedCloud => {
            match run_managed_cloud(
                &client,
                key,
                &managed_cloud_raw_base(),
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
                thinking_budget,
                effort,
            )
            .await
            {
                Ok(completed) => Ok(completed),
                Err(error) => Err(with_usage_limit_context(error, key).await),
            }
        }
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
                effort,
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
                effort,
            )
            .await
        }
        Provider::Ollama(OllamaMode::Local) => {
            let configured_base_url =
                crate::local_models::configured_local_base_url(config, "ollama");
            let base_url = crate::local_models::ensure_local_model_available(
                &client,
                "ollama",
                &configured_base_url,
                model,
            )
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
                            // strip tools the model is known to support, fall back to
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
                effort,
            )
            .await
        }
        Provider::Ollama(OllamaMode::Cloud) => {
            let base_url = config
                .base_url("ollama-cloud")
                .unwrap_or_else(|| "https://ollama.com/v1".to_string());
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
                effort,
            )
            .await
        }
        Provider::OpenAICompatible { name, base_url, .. } => {
            let completion_url = if *name == "lmstudio" {
                let configured_base_url =
                    crate::local_models::configured_local_base_url(config, "lmstudio");
                let verified_base_url = crate::local_models::ensure_local_model_available(
                    &client,
                    "lmstudio",
                    &configured_base_url,
                    model,
                )
                .await?;
                crate::local_models::openai_chat_completions_url(&verified_base_url)?
            } else {
                (*base_url).to_string()
            };
            run_spec(
                &client,
                &openai_compat_spec(name, &completion_url, key),
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
                None,
                effort,
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
                effort,
            )
            .await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reasoning_the_gateway_inlines_never_reaches_the_answer() {
        let mut thinking = InlineThinking::default();
        let mut shown = String::new();
        for chunk in [
            "<thin",
            "king>**Evaluating** warm ",
            "colours</th",
            "inking>Re",
            "d.",
        ] {
            shown.push_str(&thinking.push(chunk));
        }
        shown.push_str(&thinking.finish());
        assert_eq!(shown, "Red.");

        let result = managed_visible(
            completion_result_from(agiworkforce_llm::ChatOutcome {
                text: "<thinking>plan</thinking>Answer <b>bold</b> <thin".to_string(),
                ..Default::default()
            }),
            true,
        );
        assert_eq!(result.text, "Answer <b>bold</b> <thin");
        let untouched = managed_visible(
            completion_result_from(agiworkforce_llm::ChatOutcome {
                text: "<thinking>kept for direct providers</thinking>".to_string(),
                ..Default::default()
            }),
            false,
        );
        assert_eq!(
            untouched.text,
            "<thinking>kept for direct providers</thinking>"
        );
    }
    use axum::{
        http::header,
        response::IntoResponse,
        routing::{get, post},
        Json, Router,
    };
    use std::{
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc, Mutex,
        },
        time::Duration,
    };

    /// A configured temperature must not reach a model whose provider rejects
    /// sampling parameters. Before this guard, selecting a flagged reasoning
    /// model with `--temperature 0.3` put `temperature` in the body and 400'd.
    #[test]
    fn effective_temperature_drops_sampling_for_models_the_catalog_flags() {
        let rejects_sampling = crate::model_catalog::catalog()
            .all()
            .iter()
            .find(|model| crate::model_catalog::model_rejects_sampling_parameters(&model.id))
            .expect("catalog must contain a model that rejects sampling parameters");
        assert!(
            crate::model_catalog::model_rejects_sampling_parameters(&rejects_sampling.id),
            "selected catalog row must remain flagged rejectsSamplingParameters"
        );
        assert_eq!(effective_temperature(&rejects_sampling.id, Some(0.3)), None);

        // Everything else keeps the caller's value, the guard is a per-model
        // exclusion read from the catalog, not a blanket strip.
        for accepts_sampling in crate::model_catalog::catalog()
            .all()
            .iter()
            .filter(|model| !crate::model_catalog::model_rejects_sampling_parameters(&model.id))
            .take(2)
        {
            assert_eq!(
                effective_temperature(&accepts_sampling.id, Some(0.3)),
                Some(0.3)
            );
        }
        assert_eq!(
            effective_temperature("fixture-local-model:latest", Some(0.9)),
            Some(0.9)
        );
        assert_eq!(effective_temperature(&rejects_sampling.id, None), None);
    }

    #[tokio::test]
    async fn lmstudio_probe_and_stream_use_the_configured_loopback_endpoint() {
        let model_hits = Arc::new(AtomicUsize::new(0));
        let chat_hits = Arc::new(AtomicUsize::new(0));
        let model_hits_for_route = Arc::clone(&model_hits);
        let chat_hits_for_route = Arc::clone(&chat_hits);
        let router = Router::new()
            .route(
                "/v1/models",
                get(move || {
                    let model_hits = Arc::clone(&model_hits_for_route);
                    async move {
                        model_hits.fetch_add(1, Ordering::SeqCst);
                        Json(serde_json::json!({
                            "object": "list",
                            "data": [{"id": "agi-e2e-local-fixture"}]
                        }))
                    }
                }),
            )
            .route(
                "/v1/chat/completions",
                post(move || {
                    let chat_hits = Arc::clone(&chat_hits_for_route);
                    async move {
                        chat_hits.fetch_add(1, Ordering::SeqCst);
                        (
                            [(header::CONTENT_TYPE, "text/event-stream")],
                            concat!(
                                "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"configured-\"},\"finish_reason\":null}]}\n\n",
                                "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"endpoint\"},\"finish_reason\":null}]}\n\n",
                                "data: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":2}}\n\n",
                                "data: [DONE]\n\n"
                            ),
                        )
                            .into_response()
                    }
                }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind LM Studio fixture");
        let address = listener.local_addr().expect("fixture address");
        let server = tokio::spawn(async move {
            axum::serve(listener, router)
                .await
                .expect("serve LM Studio fixture");
        });

        let mut config = CliConfig::default();
        config.providers.insert(
            "lmstudio".to_string(),
            crate::config::ProviderConfig {
                api_key_env: None,
                base_url: Some(format!("http://{address}/v1")),
            },
        );
        let streamed = Arc::new(Mutex::new(String::new()));
        let streamed_for_callback = Arc::clone(&streamed);
        let result = stream_completion(
            &config,
            &crate::models::lmstudio_provider(),
            "agi-e2e-local-fixture",
            &[Message::text("user", "prove configured endpoint authority")],
            64,
            None,
            Box::new(move |chunk| {
                streamed_for_callback
                    .lock()
                    .expect("stream callback lock")
                    .push_str(chunk);
            }),
            None,
            None,
        )
        .await
        .expect("configured LM Studio turn");
        server.abort();

        assert_eq!(result.text, "configured-endpoint");
        assert_eq!(
            streamed.lock().expect("streamed text lock").as_str(),
            "configured-endpoint"
        );
        assert_eq!(model_hits.load(Ordering::SeqCst), 1);
        assert_eq!(chat_hits.load(Ordering::SeqCst), 1);
    }

    async fn managed_turn_body(effort: Option<crate::design_system::Effort>) -> serde_json::Value {
        let captured = Arc::new(Mutex::new(serde_json::Value::Null));
        let captured_for_route = Arc::clone(&captured);
        let cancels = Arc::new(AtomicUsize::new(0));
        let cancels_for_route = Arc::clone(&cancels);
        let router = Router::new()
            .route(
                "/api/llm/v1/chat/completions/runs/{run_id}",
                post(move || {
                    let cancels = Arc::clone(&cancels_for_route);
                    async move {
                        cancels.fetch_add(1, Ordering::SeqCst);
                        axum::http::StatusCode::ACCEPTED
                    }
                }),
            )
            .route(
            "/api/llm/v1/chat/completions",
            post(move |Json(body): Json<serde_json::Value>| {
                let captured = Arc::clone(&captured_for_route);
                async move {
                    *captured.lock().expect("captured body lock") = body;
                    (
                        [
                            (header::CONTENT_TYPE, "text/event-stream"),
                            (
                                header::HeaderName::from_static("x-agi-agent-run-id"),
                                "run_0190a000-completed",
                            ),
                        ],
                        concat!(
                            "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"ok\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1}}\n\n",
                            "data: [DONE]\n\n"
                        ),
                    )
                        .into_response()
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind managed fixture");
        let address = listener.local_addr().expect("fixture address");
        let server = tokio::spawn(async move {
            axum::serve(listener, router)
                .await
                .expect("serve managed fixture");
        });
        let mut on_chunk: StreamCallback = Box::new(|_| {});
        run_managed_cloud(
            &Client::new(),
            "test-jwt",
            &format!("http://{address}"),
            "agi-e2e-managed-fixture",
            &[Message::text("user", "which effort reached the server")],
            64,
            None,
            None,
            &mut on_chunk,
            None,
            effort,
        )
        .await
        .expect("managed fixture turn");
        tokio::time::sleep(Duration::from_millis(100)).await;
        server.abort();
        assert_eq!(
            cancels.load(Ordering::SeqCst),
            0,
            "a completed turn must not cancel its run"
        );
        let body = captured.lock().expect("captured body lock").clone();
        body
    }

    #[tokio::test]
    async fn stopping_a_managed_turn_cancels_the_server_run_it_started() {
        use futures_util::StreamExt;

        let cancels = Arc::new(Mutex::new(Vec::<String>::new()));
        let cancels_for_route = Arc::clone(&cancels);
        let router = Router::new()
            .route(
                "/api/llm/v1/chat/completions",
                post(|| async {
                    let first = futures_util::stream::iter([Ok::<_, std::io::Error>(
                        "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"partial\"},\"finish_reason\":null}]}\n\n",
                    )]);
                    (
                        [
                            (header::CONTENT_TYPE, "text/event-stream"),
                            (
                                header::HeaderName::from_static("x-agi-agent-run-id"),
                                "run_0190a000-abandoned",
                            ),
                        ],
                        axum::body::Body::from_stream(first.chain(futures_util::stream::pending())),
                    )
                        .into_response()
                }),
            )
            .route(
                "/api/llm/v1/chat/completions/runs/{run_id}",
                post(
                    move |axum::extract::Path(run_id): axum::extract::Path<String>,
                          headers: axum::http::HeaderMap| {
                        let cancels = Arc::clone(&cancels_for_route);
                        async move {
                            let bearer = headers
                                .get(header::AUTHORIZATION)
                                .and_then(|value| value.to_str().ok())
                                .unwrap_or_default()
                                .to_string();
                            cancels
                                .lock()
                                .expect("cancel log lock")
                                .push(format!("{run_id} {bearer}"));
                            axum::http::StatusCode::ACCEPTED
                        }
                    },
                ),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind managed fixture");
        let address = listener.local_addr().expect("fixture address");
        let server = tokio::spawn(async move {
            axum::serve(listener, router)
                .await
                .expect("serve managed fixture");
        });

        let streamed = Arc::new(AtomicUsize::new(0));
        let streamed_for_turn = Arc::clone(&streamed);
        let turn = tokio::spawn(async move {
            let mut on_chunk: StreamCallback = Box::new(move |_| {
                streamed_for_turn.fetch_add(1, Ordering::SeqCst);
            });
            let _ = run_managed_cloud(
                &Client::new(),
                "test-jwt",
                &format!("http://{address}"),
                "agi-e2e-managed-fixture",
                &[Message::text("user", "a long answer the user stops")],
                64,
                None,
                None,
                &mut on_chunk,
                None,
                None,
            )
            .await;
        });
        for _ in 0..200 {
            if streamed.load(Ordering::SeqCst) > 0 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert!(
            streamed.load(Ordering::SeqCst) > 0,
            "the turn never streamed"
        );
        turn.abort();
        let _ = turn.await;
        for _ in 0..200 {
            if !cancels.lock().expect("cancel log lock").is_empty() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        server.abort();
        assert_eq!(
            cancels.lock().expect("cancel log lock").as_slice(),
            ["run_0190a000-abandoned Bearer test-jwt".to_string()]
        );
    }

    fn catalog_model_with_messages_effort() -> (String, &'static [String]) {
        crate::model_catalog::anthropic_primary_models()
            .into_iter()
            .find_map(
                |(id, _, _)| match crate::model_catalog::messages_effort(&id) {
                    crate::model_catalog::MessagesEffort::OutputConfig {
                        levels,
                        adaptive_thinking: true,
                    } => Some((id, levels)),
                    _ => None,
                },
            )
            .expect("the catalog has an adaptive-thinking Claude model")
    }

    #[test]
    fn a_chosen_effort_reaches_claude_as_adaptive_thinking_at_that_level() {
        let (model, levels) = catalog_model_with_messages_effort();
        for effort in [
            crate::design_system::Effort::Medium,
            crate::design_system::Effort::High,
        ] {
            let (thinking, sent, budget) = messages_reasoning_controls(
                &Dialect::Anthropic,
                &model,
                Some(effort),
                effort.thinking_budget_for_anthropic(),
            );
            assert_eq!(
                thinking,
                Some(agiworkforce_llm::AnthropicThinking::Adaptive),
                "{effort:?}"
            );
            assert_eq!(sent, Some(effort.wire_value()), "{effort:?} of {levels:?}");
            assert_eq!(budget, None, "{effort:?} sent a manual budget");
        }
        let (thinking, sent, budget) =
            messages_reasoning_controls(&Dialect::Anthropic, &model, None, None);
        assert_eq!((thinking, sent, budget), (None, None, None));
    }

    fn catalog_model_with_thinking_display() -> String {
        crate::model_catalog::anthropic_primary_models()
            .into_iter()
            .map(|(id, _, _)| id)
            .find(|id| {
                crate::model_catalog::thinking_display(id)
                    .is_some_and(|display| display.thinks_by_default)
            })
            .expect("the catalog has a Claude model that needs a thinking display")
    }

    #[test]
    fn a_claude_request_asks_for_the_thinking_summary_the_catalog_declares() {
        let model = catalog_model_with_thinking_display();
        let (thinking, display) = with_thinking_display(&Dialect::Anthropic, &model, None, None);
        assert_eq!(
            thinking,
            Some(agiworkforce_llm::AnthropicThinking::Adaptive)
        );
        assert_eq!(display, Some("summarized"));

        let (thinking, sent, budget) = messages_reasoning_controls(
            &Dialect::Anthropic,
            &model,
            Some(crate::design_system::Effort::High),
            None,
        );
        let (thinking, display) =
            with_thinking_display(&Dialect::Anthropic, &model, thinking, budget);
        let messages = [Message::text("user", "Plan.")];
        let request = ChatRequest {
            model: &model,
            messages: &messages,
            max_tokens: 1024,
            temperature: None,
            tools: None,
            thinking_budget: budget,
            tool_choice: None,
            anthropic_thinking: thinking,
            thinking_display: display,
            effort: sent,
            top_p: None,
            top_k: None,
            metadata: None,
            reasoning_effort: None,
            gemini_thinking_budget: None,
            num_ctx: None,
            ollama_think: None,
            idle_timeout: STREAM_IDLE_TIMEOUT,
        };
        let body = agiworkforce_llm::build_anthropic_request_body(&request);
        assert_eq!(
            body["thinking"],
            serde_json::json!({"type": "adaptive", "display": "summarized"})
        );
    }

    #[test]
    fn a_non_anthropic_dialect_never_carries_a_thinking_display() {
        let model = catalog_model_with_thinking_display();
        let (thinking, display) = with_thinking_display(&Dialect::OllamaNative, &model, None, None);
        assert_eq!((thinking, display), (None, None));
    }

    #[tokio::test]
    async fn streamed_reasoning_reaches_the_sink_and_stays_out_of_the_answer() {
        let shown = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let answer = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let sink_shown = shown.clone();
        let sink: ReasoningSink = std::sync::Arc::new(move |text: &str| {
            sink_shown.lock().expect("shown lock").push_str(text);
        });
        let answer_sink = answer.clone();
        showing_reasoning(sink, async move {
            let mut on_chunk: StreamCallback = Box::new(move |text: &str| {
                answer_sink.lock().expect("answer lock").push_str(text);
            });
            let mut resolved_model = None;
            let mut inline = InlineThinking::default();
            {
                let mut direct =
                    stream_event_handler(&mut on_chunk, None, &mut resolved_model, None);
                direct(StreamEvent::ReasoningDelta {
                    text: "Checking the config first. ".to_string(),
                });
                direct(StreamEvent::TextDelta {
                    text: "Done.".to_string(),
                });
            }
            let mut managed =
                stream_event_handler(&mut on_chunk, None, &mut resolved_model, Some(&mut inline));
            for text in ["<thinking>Then the te", "sts.</thinking>", " All green."] {
                managed(StreamEvent::TextDelta {
                    text: text.to_string(),
                });
            }
        })
        .await;
        assert_eq!(
            shown.lock().expect("shown lock").as_str(),
            "Checking the config first. Then the tests."
        );
        assert_eq!(
            answer.lock().expect("answer lock").as_str(),
            "Done. All green."
        );
    }

    fn reasoning_frame(delta: &str) -> StreamEvent {
        StreamEvent::Vendor {
            event: "x_agent_event".to_string(),
            data: serde_json::json!({
                "schemaVersion": 1,
                "sequence": 0,
                "event": { "type": "reasoning-delta", "delta": delta }
            }),
        }
    }

    async fn shown_by_managed_stream(events: Vec<StreamEvent>) -> (String, String) {
        let shown = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let answer = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let sink_shown = shown.clone();
        let sink: ReasoningSink = std::sync::Arc::new(move |text: &str| {
            sink_shown.lock().expect("shown lock").push_str(text);
        });
        let answer_sink = answer.clone();
        showing_reasoning(sink, async move {
            let mut on_chunk: StreamCallback = Box::new(move |text: &str| {
                answer_sink.lock().expect("answer lock").push_str(text);
            });
            let mut resolved_model = None;
            let mut inline = InlineThinking::default();
            let mut pause = ManagedApprovalPause::default();
            let mut managed = stream_event_handler(
                &mut on_chunk,
                Some(&mut pause),
                &mut resolved_model,
                Some(&mut inline),
            );
            for event in events {
                managed(event);
            }
        })
        .await;
        let shown = shown.lock().expect("shown lock").clone();
        let answer = answer.lock().expect("answer lock").clone();
        (shown, answer)
    }

    #[tokio::test]
    async fn the_gateway_reasoning_event_reaches_the_sink_and_stays_out_of_the_answer() {
        let (shown, answer) = shown_by_managed_stream(vec![
            reasoning_frame("Comparing the two sort keys. "),
            reasoning_frame("Ties keep insertion order."),
            StreamEvent::TextDelta {
                text: "It returns the high task first.".to_string(),
            },
        ])
        .await;
        assert_eq!(
            shown,
            "Comparing the two sort keys. Ties keep insertion order."
        );
        assert_eq!(answer, "It returns the high task first.");
    }

    #[tokio::test]
    async fn reasoning_sent_both_inline_and_as_an_event_is_shown_once() {
        let (shown, answer) = shown_by_managed_stream(vec![
            StreamEvent::TextDelta {
                text: "<thinking>Check the ".to_string(),
            },
            reasoning_frame("Check the "),
            StreamEvent::TextDelta {
                text: "store.</thinking>Done.".to_string(),
            },
            reasoning_frame("store."),
            reasoning_frame(" Then the CLI."),
        ])
        .await;
        assert_eq!(shown, "Check the store. Then the CLI.");
        assert_eq!(answer, "Done.");
    }

    #[test]
    fn a_managed_effort_asks_the_server_to_think_on_a_reasoning_model() {
        let (model, _) = catalog_model_with_messages_effort();
        let fields = managed_effort_field(&model, Some(crate::design_system::Effort::Medium));
        assert!(fields.contains(&("effort".to_string(), serde_json::json!("medium"))));
        assert!(fields.contains(&("thinking_mode".to_string(), serde_json::json!(true))));
        assert!(managed_effort_field(&model, None).is_empty());
        assert!(!managed_effort_field(
            "agi-e2e-managed-fixture",
            Some(crate::design_system::Effort::High)
        )
        .iter()
        .any(|(key, _)| key == "thinking_mode"));
    }

    #[tokio::test]
    async fn a_managed_turn_sends_the_chosen_reasoning_effort_to_the_server() {
        let body = managed_turn_body(Some(crate::design_system::Effort::Medium)).await;
        assert_eq!(body["effort"], "medium", "{body}");
        assert_eq!(body["use_prompt_cache"], true, "{body}");
        let body = managed_turn_body(Some(crate::design_system::Effort::High)).await;
        assert_eq!(body["effort"], "high", "{body}");
        let body = managed_turn_body(None).await;
        assert!(body.get("effort").is_none(), "{body}");
    }

    #[test]
    fn managed_cloud_requests_name_the_surface_the_build_and_the_contract() {
        use crate::cloud::handshake;

        let spec = managed_cloud_spec_for_base("test-jwt", "https://agiworkforce.com")
            .expect("a trusted host resolves");
        for (name, value) in handshake::headers() {
            assert!(
                spec.extra_headers
                    .iter()
                    .any(|(sent, carried)| sent == name && carried == value),
                "Managed Cloud refuses a request that does not identify its build: {:?}",
                spec.extra_headers
            );
        }
    }

    #[test]
    fn each_managed_cloud_request_carries_its_own_idempotency_key() {
        let key_of = |spec: &ProviderSpec| {
            spec.extra_headers
                .iter()
                .find(|(name, _)| name == "Idempotency-Key")
                .map(|(_, value)| value.clone())
                .expect("Managed Cloud rejects a request with no idempotency key")
        };
        let first = managed_cloud_spec_for_base("test-jwt", "https://agiworkforce.com")
            .expect("a trusted host resolves");
        let second = managed_cloud_spec_for_base("test-jwt", "https://agiworkforce.com")
            .expect("a trusted host resolves");
        assert_ne!(
            key_of(&first),
            key_of(&second),
            "two requests sharing one key would make the server drop the second turn"
        );
    }

    #[test]
    fn managed_cloud_spec_uses_the_authenticated_agi_gateway_contract() {
        let spec = managed_cloud_spec_for_base("test-jwt", "https://agiworkforce.com")
            .expect("canonical AGI origin must be accepted");

        assert_eq!(spec.id, "managed_cloud");
        assert_eq!(
            spec.base_url,
            "https://agiworkforce.com/api/llm/v1/chat/completions"
        );
        assert_eq!(spec.auth, Auth::Bearer("test-jwt".to_string()));
        assert!(spec
            .extra_headers
            .contains(&("X-Requested-With".to_string(), "XMLHttpRequest".to_string(),)));
    }

    fn body_flag(spec: &ProviderSpec, key: &str) -> Option<serde_json::Value> {
        spec.extra_body
            .iter()
            .find(|(name, _)| name == key)
            .map(|(_, value)| value.clone())
    }

    #[tokio::test]
    async fn a_search_turn_keeps_web_search_on_every_call_and_requires_it_only_first() {
        let spec_in = |scope| {
            search_scoped(scope, async {
                managed_cloud_spec_for_base("test-jwt", "https://agiworkforce.com").unwrap()
            })
        };
        let first = spec_in(SearchScope::Required).await;
        let later = spec_in(SearchScope::RequiredContinued).await;
        let offered = spec_in(SearchScope::Offered).await;
        let off = spec_in(SearchScope::Off).await;

        for spec in [&first, &later, &offered] {
            assert_eq!(body_flag(spec, "web_search"), Some(serde_json::json!(true)));
        }
        assert_eq!(
            body_flag(&first, "search_requested"),
            Some(serde_json::json!(true))
        );
        assert_eq!(body_flag(&later, "search_requested"), None);
        assert_eq!(body_flag(&off, "web_search"), None);
    }

    #[test]
    fn the_search_nudge_lands_on_the_same_user_message_on_every_call_of_a_turn() {
        let first_call = vec![
            Message::text("system", "You are a coding agent."),
            Message::text("user", "What changed in Rust 1.90?"),
        ];
        let mut later_call = first_call.clone();
        later_call.push(Message::blocks(
            "assistant",
            vec![ContentBlock::ToolUse {
                id: "call-1".to_string(),
                name: WEB_SEARCH_TOOL.to_string(),
                input: serde_json::json!({ "query": "Rust 1.90" }),
            }],
        ));
        later_call.push(Message::blocks(
            "user",
            vec![ContentBlock::ToolResult {
                tool_use_id: "call-1".to_string(),
                content: "Rust 1.90 release notes".to_string(),
                is_error: false,
            }],
        ));

        let first = with_search_nudge(&first_call);
        let later = with_search_nudge(&later_call);

        assert!(first[1].text_content().ends_with(REQUIRED_SEARCH_NUDGE));
        assert_eq!(
            serde_json::to_string(&later[..first.len()]).unwrap(),
            serde_json::to_string(&first).unwrap(),
            "a later call resends the first call's messages byte for byte"
        );
        assert!(!serde_json::to_string(&later[3])
            .unwrap()
            .contains(REQUIRED_SEARCH_NUDGE));
    }

    #[test]
    fn managed_cloud_spec_refuses_non_agi_hosts_before_attaching_the_jwt() {
        let error = managed_cloud_spec_for_base("test-jwt", "https://attacker.example")
            .expect_err("managed JWT must never be sent to an untrusted host");

        assert!(
            error
                .to_string()
                .contains("trusted AGI Workforce HTTPS host"),
            "{error}"
        );
    }

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
        assert!(err.to_string().contains("Authentication failed"), "{err}");
    }

    #[test]
    fn map_api_preserves_status_and_provider_specific_text() {
        let llm = agiworkforce_llm::classify_error_response(
            "anthropic",
            "fixture-anthropic-model",
            529,
            None,
            "overloaded",
        );
        let err = map_llm_error(llm);
        assert!(err.to_string().contains("Anthropic is overloaded"), "{err}");
    }

    #[test]
    fn map_context_overflow_matches_cli_variant() {
        let err = map_llm_error(LlmError::ContextOverflow {
            model: "fixture-stream-model".into(),
        });
        let cli = err.downcast_ref::<CliError>().expect("CliError");
        assert!(cli.is_context_overflow());
    }

    #[test]
    fn map_idle_timeout_is_plain_anyhow_with_legacy_text() {
        let err = map_llm_error(LlmError::IdleTimeout {
            after: STREAM_IDLE_TIMEOUT,
        });
        // The historical `bail!` produced a plain anyhow error, NOT a
        // CliError, so retry/fallback logic must not see a CliError here.
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
    fn managed_forbidden_reaches_the_host_as_the_original_access_refusal() {
        let body = r#"{"error":{"code":"developer_surface_plan_required","message":"Managed coding requires a plan upgrade.","requiredTier":"pro"}}"#;
        let error = map_llm_error(agiworkforce_llm::classify_error_response(
            "managed_cloud",
            "owned-model",
            403,
            None,
            body,
        ));
        let cli = error.downcast_ref::<CliError>().expect("CLI error");
        assert!(!cli.hint().contains("auth-status"));
        let failure = cli.turn_failure();
        assert_eq!(
            failure.code,
            agiworkforce_protocol::developer_session::TurnFailureCode::InvalidRequest
        );
        assert_eq!(
            failure.action,
            agiworkforce_protocol::developer_session::TurnFailureAction::OpenSettings
        );
        assert!(failure
            .message
            .contains("Managed coding requires a plan upgrade."));
        assert!(!failure.retryable);
        assert_eq!(failure.provider.as_deref(), Some("managed_cloud"));
    }

    #[test]
    fn classified_managed_cloud_429_paywall_maps_to_cli_paywall() {
        let paywall_body = r#"{"kind":"paywall","feature":"chat","requiredTier":"pro","reason":"Pro features require upgrade"}"#;
        let llm =
            agiworkforce_llm::classify_error_response("agiworkforce", "m", 429, None, paywall_body);
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
    fn a_plan_limit_refusal_becomes_a_usage_limit_with_its_code_message_and_recovery() {
        for (status, code) in [
            (429, "rolling_five_hour_limit_reached"),
            (429, "flagship_weekly_limit_reached"),
            (402, "insufficient_credits"),
            (402, "monthly_credit_limit_reached"),
        ] {
            let body = serde_json::json!({
                "error": {
                    "message": "Limit reached for this window.",
                    "type": "insufficient_quota",
                    "code": code,
                    "resets_at": "2026-09-27T18:00:00.000Z",
                    "recovery": { "action": "view_usage", "href": "/settings/usage" }
                }
            })
            .to_string();
            let err = map_llm_error(agiworkforce_llm::classify_error_response(
                "managed_cloud",
                "m",
                status,
                Some("90"),
                &body,
            ));
            match err.downcast_ref::<CliError>() {
                Some(CliError::UsageLimit {
                    code: mapped,
                    message,
                    recovery_href,
                    retry_after,
                    ..
                }) => {
                    assert_eq!(mapped, code);
                    assert_eq!(message, "Limit reached for this window.");
                    assert_eq!(recovery_href.as_deref(), Some("/settings/usage"));
                    assert_eq!(*retry_after, Some(90));
                }
                other => panic!("{status} {code} did not map to a usage limit: {other:?}"),
            }
            let cli = err.downcast_ref::<CliError>().expect("CliError");
            assert!(!cli.is_retryable(), "{code}");
            assert_eq!(cli.exit_code(), 78, "{code}");
        }
    }

    #[test]
    fn a_recovery_link_off_the_product_origin_is_dropped() {
        for href in ["https://attacker.example/pay", "//attacker.example/pay"] {
            let body = serde_json::json!({
                "error": {
                    "message": "Weekly limit reached.",
                    "code": "rolling_weekly_limit_reached",
                    "recovery": { "action": "upgrade", "href": href }
                }
            })
            .to_string();
            let err = map_llm_error(agiworkforce_llm::classify_error_response(
                "managed_cloud",
                "m",
                429,
                None,
                &body,
            ));
            assert!(
                matches!(
                    err.downcast_ref::<CliError>(),
                    Some(CliError::UsageLimit {
                        recovery_href: None,
                        ..
                    })
                ),
                "{href}: {err:?}"
            );
        }
    }

    #[test]
    fn a_request_rate_limit_stays_a_retryable_rate_limit() {
        let body = r#"{"error":{"code":"rate_limit_exceeded","message":"Too many requests."}}"#;
        let err = map_llm_error(agiworkforce_llm::classify_error_response(
            "managed_cloud",
            "m",
            429,
            Some("3"),
            body,
        ));
        let cli = err.downcast_ref::<CliError>().expect("CliError");
        assert!(matches!(cli, CliError::RateLimited { .. }), "{cli:?}");
        assert!(cli.is_retryable());
    }

    #[test]
    fn a_quota_warning_names_the_window_and_how_much_of_it_is_used() {
        let warning = |value: &str| {
            quota_warning(&serde_json::json!({ "value": value }))
                .map(|warning| (warning.scope, warning.level, warning.notice))
        };
        assert_eq!(
            warning(
                "level=warning; scope=rolling_five_hour; used_percent=82; threshold_percent=80"
            ),
            Some((
                "rolling_five_hour".to_string(),
                "warning".to_string(),
                "You have used 82% of your 5-hour window. Run `agi usage` to see what is left."
                    .to_string()
            ))
        );
        assert_eq!(
            warning("level=critical; scope=rolling_weekly; used_percent=96")
                .map(|(_, _, notice)| notice),
            Some(
                "You have used 96% of your weekly allowance. Run `agi usage` to see what is left."
                    .to_string()
            )
        );
        assert_eq!(
            warning("level=critical; scope=billing_period; used_percent=140")
                .map(|(_, _, notice)| notice),
            Some(
                "You have used 100% of your monthly allowance. Run `agi usage` to see what is left."
                    .to_string()
            )
        );
    }

    #[test]
    fn a_reply_billed_to_usage_credits_says_so() {
        let warning =
            quota_warning(&serde_json::json!({ "value": "level=info; scope=usage_credits" }))
                .map(|warning| (warning.scope, warning.notice));
        assert_eq!(
            warning,
            Some((
                "usage_credits".to_string(),
                "Now using usage credits. Your plan limit is reached, so messages are billed to your credits. Run `agi usage` to see your balance."
                    .to_string()
            ))
        );
    }

    #[test]
    fn a_quota_warning_the_cli_cannot_state_is_not_shown() {
        for value in [
            "level=warning; scope=computer_use_soft_cap; used_percent=90",
            "level=warning; scope=rolling_weekly",
            "scope=rolling_weekly; used_percent=85",
            "level=warning; scope=rolling_weekly; used_percent=eighty",
        ] {
            assert!(
                quota_warning(&serde_json::json!({ "value": value })).is_none(),
                "{value}"
            );
        }
        assert!(quota_warning(&serde_json::json!({})).is_none());
    }

    #[test]
    fn a_managed_request_is_identified_by_the_idempotency_key_it_was_sent_with() {
        let spec = managed_cloud_spec_for_base("test-jwt", "https://agiworkforce.com")
            .expect("a trusted host resolves");
        let sent = spec
            .extra_headers
            .iter()
            .find(|(name, _)| name == "Idempotency-Key")
            .map(|(_, value)| value.clone());
        let request_id = managed_request_id(&spec);
        assert_eq!(request_id, sent);
        assert!(
            request_id
                .as_deref()
                .is_some_and(|id| id.starts_with("agi.cli.chat.")),
            "{request_id:?}"
        );
        assert_eq!(managed_request_id(&anthropic_spec("k")), None);
    }

    #[test]
    fn paywall_exit_code_is_78() {
        let err = crate::errors::CliError::paywall("chat", "hobby", "quota exceeded");
        assert_eq!(err.exit_code(), 78);
    }

    #[test]
    fn a_rate_limit_exits_as_a_failure_the_same_command_may_survive() {
        let err = crate::errors::CliError::rate_limited("anthropic", None);
        assert_eq!(
            err.exit_code(),
            crate::errors::ExitClass::TemporaryFailure.code()
        );
        assert_ne!(
            err.exit_code(),
            crate::errors::CliError::paywall("chat", "pro", "quota").exit_code()
        );
    }

    // -- Spec mapping --

    #[test]
    fn subscription_specs_carry_provider_headers() {
        let copilot = subscription_spec(
            "copilot",
            "https://api.githubcopilot.com/chat/completions",
            "tok",
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
    }

    #[test]
    fn openai_compat_spec_sends_bearer_even_when_keyless() {
        // Historical wire behavior: LM Studio (keyless) still receives an
        // Authorization header with an empty Bearer token.
        let spec = openai_compat_spec("lmstudio", "http://localhost:1234/v1/chat/completions", "");
        assert_eq!(spec.auth, Auth::Bearer(String::new()));
        assert!(matches!(&spec.dialect, Dialect::OpenAiCompat(o) if !o.use_max_completion_tokens));
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
