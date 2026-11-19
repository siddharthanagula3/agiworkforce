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
//! - provider selection + key resolution (`provider_dispatch`) stay here,
//!   the crate receives opaque credentials via `ProviderSpec`;
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
use crate::design_system::Effort;
use crate::errors::CliError;
use crate::model_catalog::{EffortParameter, EffortSupport};

use super::managed_approvals::{self, ManagedApprovalPause};
use super::{
    provider_dispatch::resolve_key, CompletionResult, ContentBlock, Message, MessageContent,
    OllamaMode, Provider, StreamCallback, ToolDefinition, STREAM_IDLE_TIMEOUT,
};

pub const WEB_SEARCH_TOOL: &str = "web_search";

const REQUIRED_SEARCH_NUDGE: &str = "This turn requires live web results. Call the web search tool before you answer, base the answer on what it returns, and cite the pages you used. Do not answer from memory alone, and do not tell the user to search for themselves. If a search returns nothing usable, say so plainly instead of substituting your own recollection.";

tokio::task_local! {
    static SEARCH_TURN: ();
}

pub(crate) async fn searching<F: std::future::Future>(future: F) -> F::Output {
    SEARCH_TURN.scope((), future).await
}

fn search_turn() -> bool {
    SEARCH_TURN.try_with(|_| ()).is_ok()
}

tokio::task_local! {
    static SEARCH_OFFERED: ();
}

pub async fn offering_search<F: std::future::Future>(future: F) -> F::Output {
    SEARCH_OFFERED.scope((), future).await
}

fn search_offered() -> bool {
    SEARCH_OFFERED.try_with(|_| ()).is_ok()
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

pub(crate) type ReasoningSink = std::sync::Arc<dyn Fn(&str) + Send + Sync>;

tokio::task_local! {
    static REASONING_SINK: ReasoningSink;
}

pub(crate) async fn forwarding_reasoning<F: std::future::Future>(
    sink: ReasoningSink,
    future: F,
) -> F::Output {
    REASONING_SINK.scope(sink, future).await
}

fn forward_reasoning(text: &str) {
    if text.is_empty() {
        return;
    }
    let _ = REASONING_SINK.try_with(|sink| sink(text));
}

fn with_search_nudge(messages: &[Message]) -> Vec<Message> {
    let mut nudged = messages.to_vec();
    if let Some(last_user) = nudged
        .iter_mut()
        .rev()
        .find(|message| message.role == "user")
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

/// The client for Managed and BYOK provider requests.
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

fn local_provider_client() -> Result<&'static Client> {
    static CLIENT: std::sync::OnceLock<std::result::Result<Client, reqwest::Error>> =
        std::sync::OnceLock::new();
    CLIENT
        .get_or_init(|| {
            crate::local_models::local_client_builder()
                .connect_timeout(PROVIDER_CONNECT_TIMEOUT)
                .read_timeout(STREAM_IDLE_TIMEOUT)
                .build()
        })
        .as_ref()
        .map_err(|error| {
            anyhow::anyhow!("failed to build isolated Local inference client: {error}")
        })
}

fn client_for_provider(provider: &Provider) -> Result<&'static Client> {
    if crate::agent::provider_privacy_mode(provider) == crate::agent::PrivacyMode::Local {
        local_provider_client()
    } else {
        Ok(provider_client())
    }
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
        LlmError::ContextOverflow { model } => {
            let limit = crate::model_catalog::find(&model)
                .map(|entry| entry.context_window)
                .unwrap_or_default();
            CliError::context_overflow(model, 0, limit).into()
        }
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
    let endpoint = managed_chat_endpoint(raw_base)?;

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
                (search_turn() || search_offered())
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
            .collect(),
    })
}

pub(crate) fn managed_chat_endpoint(raw_base: &str) -> Result<String> {
    managed_cloud_url_for_base(raw_base, "llm/v1/chat/completions")
}

fn managed_cloud_spec(jwt: &str) -> Result<ProviderSpec> {
    managed_cloud_spec_for_base(jwt, &managed_cloud_raw_base())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReasoningRoute {
    Anthropic,
    Gemini,
    Managed,
    ChatCompletions,
    Unsupported,
}

impl ReasoningRoute {
    fn of_spec(spec: &ProviderSpec) -> Self {
        if spec.id == super::provider_name(&Provider::ManagedCloud) {
            return ReasoningRoute::Managed;
        }
        match &spec.dialect {
            Dialect::Anthropic => ReasoningRoute::Anthropic,
            Dialect::Gemini => ReasoningRoute::Gemini,
            Dialect::OpenAiCompat(_) => ReasoningRoute::ChatCompletions,
            Dialect::OllamaNative | Dialect::OpenAiResponses => ReasoningRoute::Unsupported,
        }
    }

    fn of_provider(provider: &Provider) -> Self {
        match provider {
            Provider::ManagedCloud => ReasoningRoute::Managed,
            Provider::Anthropic => ReasoningRoute::Anthropic,
            Provider::Google => ReasoningRoute::Gemini,
            Provider::Ollama(OllamaMode::Local) => ReasoningRoute::Unsupported,
            Provider::Ollama(OllamaMode::Cloud)
            | Provider::OpenAICompatible { .. }
            | Provider::Custom { .. } => ReasoningRoute::ChatCompletions,
        }
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
struct ReasoningWire {
    output_config_effort: Option<String>,
    thinking_budget: Option<u32>,
    gemini_thinking_budget: Option<u32>,
    body_field: Option<(&'static str, String)>,
}

impl ReasoningWire {
    fn apply<'a>(&'a self, req: &mut ChatRequest<'a>) {
        req.effort = self.output_config_effort.as_deref();
        req.thinking_budget = self.thinking_budget;
        req.gemini_thinking_budget = self.gemini_thinking_budget;
    }

    fn spec_for(&self, spec: &ProviderSpec) -> Option<ProviderSpec> {
        self.body_field.as_ref().map(|(field, level)| {
            let mut with_field = spec.clone();
            with_field.extra_body.push((
                (*field).to_string(),
                serde_json::Value::String(level.clone()),
            ));
            with_field
        })
    }
}

fn effort_level(model: &str, effort: Effort, managed: bool) -> Option<String> {
    match crate::model_catalog::effort_support(model) {
        EffortSupport::Levels(levels) => {
            crate::model_catalog::nearest_supported_effort(effort.wire_value(), &levels)
                .map(str::to_string)
        }
        EffortSupport::Any => Some(effort.openai_effort_str().to_string()),
        EffortSupport::NotInCatalog if managed => Some(effort.wire_value().to_string()),
        EffortSupport::NotInCatalog | EffortSupport::Unsupported => None,
    }
}

fn reasoning_wire(
    route: ReasoningRoute,
    model: &str,
    effort: Option<Effort>,
    thinking_budget: Option<u32>,
) -> ReasoningWire {
    let parameter = crate::model_catalog::effort_parameter(model);
    let budget_accepted = crate::model_catalog::accepts_thinking_budget(model);
    let level =
        effort.and_then(|effort| effort_level(model, effort, route == ReasoningRoute::Managed));
    match route {
        ReasoningRoute::Anthropic => ReasoningWire {
            output_config_effort: level
                .filter(|_| parameter == Some(EffortParameter::OutputConfigEffort)),
            thinking_budget: thinking_budget.filter(|_| budget_accepted),
            ..ReasoningWire::default()
        },
        ReasoningRoute::Gemini => ReasoningWire {
            gemini_thinking_budget: effort
                .filter(|_| budget_accepted)
                .map(Effort::gemini_thinking_budget),
            ..ReasoningWire::default()
        },
        ReasoningRoute::Managed => ReasoningWire {
            body_field: level.map(|level| ("effort", level)),
            ..ReasoningWire::default()
        },
        ReasoningRoute::ChatCompletions => ReasoningWire {
            body_field: level
                .filter(|_| parameter == Some(EffortParameter::ReasoningEffort))
                .map(|level| ("reasoning_effort", level)),
            ..ReasoningWire::default()
        },
        ReasoningRoute::Unsupported => ReasoningWire::default(),
    }
}

pub fn effort_reaches_model(provider: &Provider, model: &str, effort: Effort) -> bool {
    reasoning_wire(
        ReasoningRoute::of_provider(provider),
        model,
        Some(effort),
        effort.thinking_budget_for_anthropic(),
    ) != ReasoningWire::default()
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
    let reasoning = reasoning_wire(
        ReasoningRoute::of_spec(spec),
        model,
        effort,
        thinking_budget,
    );
    let reasoning_spec = reasoning.spec_for(spec);
    let spec = reasoning_spec.as_ref().unwrap_or(spec);
    let searching = search_turn()
        && spec.id != super::provider_name(&Provider::ManagedCloud)
        && tools.is_some_and(|tools| tools.iter().any(|tool| tool.name == WEB_SEARCH_TOOL));
    let forced_search = searching
        && crate::model_catalog::accepts_forced_tool_choice(model)
        && !(matches!(spec.dialect, Dialect::Anthropic) && reasoning.thinking_budget.is_some());
    let nudged;
    let messages = if searching && !forced_search {
        nudged = with_search_nudge(messages);
        nudged.as_slice()
    } else {
        messages
    };
    let mut req = ChatRequest {
        model: &wire_model,
        messages,
        max_tokens,
        temperature: effective_temperature(model, temperature),
        tools,
        thinking_budget: None,
        tool_choice: forced_search.then(|| ToolChoice::Specific(WEB_SEARCH_TOOL.to_string())),
        anthropic_thinking: None,
        effort: None,
        top_p: None,
        top_k: None,
        metadata: None,
        reasoning_effort: None,
        gemini_thinking_budget: None,
        num_ctx: None,
        ollama_think: None,
        idle_timeout: STREAM_IDLE_TIMEOUT,
    };
    reasoning.apply(&mut req);
    let mut resolved_model = None;
    let mut thinking =
        (spec.id == super::provider_name(&Provider::ManagedCloud)).then(InlineThinking::default);
    let mut on_event =
        stream_event_handler(on_chunk, pause, &mut resolved_model, thinking.as_mut());
    let outcome = stream_chat(client, spec, &req, &mut on_event).await;
    drop(on_event);
    if let Some(thinking) = thinking.as_mut() {
        let rest = thinking.finish();
        forward_reasoning(&thinking.take_thought());
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
    thought: String,
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
        self.held.push_str(chunk);
        let mut visible = String::new();
        loop {
            let tag = if self.inside {
                THINKING_CLOSE
            } else {
                THINKING_OPEN
            };
            if let Some(at) = self.held.find(tag) {
                if self.inside {
                    self.thought.push_str(&self.held[..at]);
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
                self.thought.push_str(&self.held[..cut]);
            } else {
                visible.push_str(&self.held[..cut]);
            }
            self.held.drain(..cut);
            return visible;
        }
    }

    fn finish(&mut self) -> String {
        let rest = if self.inside {
            self.thought.push_str(&self.held);
            String::new()
        } else {
            std::mem::take(&mut self.held)
        };
        self.held.clear();
        rest
    }

    fn take_thought(&mut self) -> String {
        std::mem::take(&mut self.thought)
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

fn stream_event_handler<'a>(
    on_chunk: &'a mut StreamCallback,
    mut pause: Option<&'a mut ManagedApprovalPause>,
    resolved_model: &'a mut Option<String>,
    mut thinking: Option<&'a mut InlineThinking>,
) -> impl FnMut(StreamEvent) + Send + 'a {
    move |event| match event {
        StreamEvent::TextDelta { text } => match thinking.as_deref_mut() {
            Some(thinking) => {
                let visible = thinking.push(&text);
                forward_reasoning(&thinking.take_thought());
                if !visible.is_empty() {
                    on_chunk(&visible);
                }
            }
            None => on_chunk(&text),
        },
        StreamEvent::ReasoningDelta { text } => forward_reasoning(&text),
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
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
    thinking_budget: Option<u32>,
    effort: Option<crate::design_system::Effort>,
) -> Result<CompletionResult> {
    let mut spec = managed_cloud_spec(jwt)?;
    let mut pause = ManagedApprovalPause::default();
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
            spec = managed_cloud_spec(jwt)?;
            spec.extra_body.retain(|(key, _)| key != "conversation_id");
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
        forward_reasoning(&thinking.take_thought());
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
    Ok(completed)
}

fn ollama_cloud_base_url(config: &CliConfig) -> Result<String> {
    let base_url = config
        .base_url("ollama-cloud")
        .unwrap_or_else(|| "https://ollama.com/v1".to_string());
    let trimmed = base_url.trim_end_matches('/');
    if !super::provider_dispatch::is_safe_provider_base_url(trimmed) {
        return Err(CliError::config(format!(
            "ollama-cloud base_url must be https:// or a loopback http:// address without credentials: {base_url}"
        ))
        .into());
    }
    Ok(trimmed.to_string())
}

fn renews_session_before_turn(provider: &Provider) -> bool {
    matches!(provider, Provider::ManagedCloud)
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
    let client = client_for_provider(provider)?.clone();
    let temperature = config.default.temperature;

    let renewal = if renews_session_before_turn(provider) {
        crate::app_server::account::renew_managed_session_if_expiring().await
    } else {
        None
    };
    if let Some(reason) = renewal {
        tracing::debug!("[streaming] session renewal before the turn: {reason}");
    }

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
            let url = format!("{}/chat/completions", ollama_cloud_base_url(config)?);
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
    fn only_a_managed_turn_renews_the_session_first() {
        assert!(renews_session_before_turn(&Provider::ManagedCloud));
        assert!(!renews_session_before_turn(&Provider::Anthropic));
        assert!(!renews_session_before_turn(&Provider::Google));
    }

    #[test]
    fn inference_client_selection_preserves_canonical_privacy_boundaries() {
        let local = local_provider_client().expect("isolated Local client");
        let cases = [
            (Provider::Ollama(OllamaMode::Local), true),
            (super::super::lmstudio_provider(), true),
            (
                Provider::OpenAICompatible {
                    name: "fixture-compatible",
                    base_url: "http://127.0.0.1:43123/v1/chat/completions",
                    api_key_env: None,
                },
                true,
            ),
            (
                Provider::OpenAICompatible {
                    name: "fixture-compatible",
                    base_url: "http://127.0.0.1:43123/v1/chat/completions",
                    api_key_env: Some("FIXTURE_KEY"),
                },
                false,
            ),
            (
                Provider::Custom {
                    name: "fixture-custom".to_string(),
                    base_url: "http://[::1]:43123/v1/chat/completions".to_string(),
                    api_key_env: None,
                },
                true,
            ),
            (
                Provider::Custom {
                    name: "fixture-custom".to_string(),
                    base_url: "http://127.0.0.1:43123/v1/chat/completions".to_string(),
                    api_key_env: Some("FIXTURE_KEY".to_string()),
                },
                false,
            ),
            (
                Provider::Custom {
                    name: "fixture-custom".to_string(),
                    base_url: "https://provider.example/v1/chat/completions".to_string(),
                    api_key_env: None,
                },
                false,
            ),
            (Provider::Ollama(OllamaMode::Cloud), false),
            (Provider::ManagedCloud, false),
        ];
        for (provider, is_local) in cases {
            let selected = client_for_provider(&provider).expect("selected client");
            assert_eq!(std::ptr::eq(selected, local), is_local, "{provider:?}");
            if !is_local {
                assert!(std::ptr::eq(selected, provider_client()), "{provider:?}");
            }
        }
    }

    #[tokio::test]
    async fn local_inference_client_does_not_forward_redirected_prompts() {
        let origin_hits = Arc::new(AtomicUsize::new(0));
        let origin_hits_for_route = Arc::clone(&origin_hits);
        let target_hits = Arc::new(AtomicUsize::new(0));
        let target_hits_for_route = Arc::clone(&target_hits);
        let router = Router::new()
            .route(
                "/v1/chat/completions",
                post(move || {
                    let origin_hits = Arc::clone(&origin_hits_for_route);
                    async move {
                        origin_hits.fetch_add(1, Ordering::SeqCst);
                        axum::response::Redirect::temporary("/redirect-target")
                    }
                }),
            )
            .route(
                "/redirect-target",
                axum::routing::any(move || {
                    let target_hits = Arc::clone(&target_hits_for_route);
                    async move {
                        target_hits.fetch_add(1, Ordering::SeqCst);
                        "unexpected prompt forwarding"
                    }
                }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind Local inference fixture");
        let url = format!(
            "http://{}/v1/chat/completions",
            listener.local_addr().expect("fixture address")
        );
        let server = tokio::spawn(async move {
            axum::serve(listener, router).await.expect("serve fixture");
        });
        let provider = Provider::Custom {
            name: "fixture-custom".to_string(),
            base_url: url.clone(),
            api_key_env: None,
        };
        let client = client_for_provider(&provider).expect("isolated Local client");
        let mut on_chunk: StreamCallback = Box::new(|_| {});
        let result = run_spec(
            client,
            &openai_compat_spec("fixture-custom", &url, ""),
            "fixture-local-model",
            &[Message::text("user", "keep this fixture prompt local")],
            64,
            None,
            None,
            &mut on_chunk,
            None,
            None,
        )
        .await;
        server.abort();

        assert!(result.is_err());
        assert_eq!(origin_hits.load(Ordering::SeqCst), 1);
        assert_eq!(target_hits.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn ollama_cloud_sends_only_to_an_https_or_loopback_endpoint_without_credentials() {
        let with_base_url = |base_url: &str| {
            let mut config = CliConfig::default();
            config.providers.insert(
                "ollama-cloud".to_string(),
                crate::config::ProviderConfig {
                    api_key_env: None,
                    base_url: Some(base_url.to_string()),
                },
            );
            config
        };

        assert_eq!(
            ollama_cloud_base_url(&CliConfig::default()).expect("default endpoint"),
            "https://ollama.com/v1"
        );
        assert_eq!(
            ollama_cloud_base_url(&with_base_url("https://ollama.example/v1/"))
                .expect("https endpoint"),
            "https://ollama.example/v1"
        );
        assert_eq!(
            ollama_cloud_base_url(&with_base_url("http://127.0.0.1:11434/v1"))
                .expect("loopback endpoint"),
            "http://127.0.0.1:11434/v1"
        );
        for refused in [
            "http://ollama.example/v1",
            "HTTP://ollama.example/v1",
            "https://user:secret@ollama.example/v1",
            "http://localhost@ollama.example/v1",
            "ftp://ollama.example/v1",
            "not a url",
        ] {
            assert!(
                ollama_cloud_base_url(&with_base_url(refused)).is_err(),
                "{refused} should be refused"
            );
        }
    }

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

    fn reasoning_recorder() -> (ReasoningSink, std::sync::Arc<std::sync::Mutex<Vec<String>>>) {
        let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let recorder = seen.clone();
        let sink: ReasoningSink = std::sync::Arc::new(move |delta: &str| {
            recorder.lock().unwrap().push(delta.to_string());
        });
        (sink, seen)
    }

    fn answer_recorder() -> (StreamCallback, std::sync::Arc<std::sync::Mutex<String>>) {
        let shown = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let recorder = shown.clone();
        let on_chunk: StreamCallback = Box::new(move |chunk: &str| {
            recorder.lock().unwrap().push_str(chunk);
        });
        (on_chunk, shown)
    }

    #[tokio::test]
    async fn a_providers_reasoning_reaches_the_turns_sink_and_never_the_answer() {
        let (sink, seen) = reasoning_recorder();
        let (mut on_chunk, shown) = answer_recorder();
        forwarding_reasoning(sink, async {
            let mut resolved_model = None;
            let mut on_event = stream_event_handler(&mut on_chunk, None, &mut resolved_model, None);
            on_event(StreamEvent::ReasoningDelta {
                text: "Comparing the two ".to_string(),
            });
            on_event(StreamEvent::ReasoningDelta {
                text: "configs".to_string(),
            });
            on_event(StreamEvent::TextDelta {
                text: "Use the second.".to_string(),
            });
        })
        .await;

        assert_eq!(*seen.lock().unwrap(), ["Comparing the two ", "configs"]);
        assert_eq!(*shown.lock().unwrap(), "Use the second.");
    }

    #[tokio::test]
    async fn the_gateways_inline_reasoning_reaches_the_turns_sink_as_it_streams() {
        let (sink, seen) = reasoning_recorder();
        let (mut on_chunk, shown) = answer_recorder();
        forwarding_reasoning(sink, async {
            let mut resolved_model = None;
            let mut thinking = InlineThinking::default();
            {
                let mut on_event = stream_event_handler(
                    &mut on_chunk,
                    None,
                    &mut resolved_model,
                    Some(&mut thinking),
                );
                for text in ["<thin", "king>Checking ", "the tests</th", "inking>Done."] {
                    on_event(StreamEvent::TextDelta {
                        text: text.to_string(),
                    });
                }
            }
            assert!(thinking.finish().is_empty());
            assert!(thinking.take_thought().is_empty());
        })
        .await;

        assert_eq!(seen.lock().unwrap().concat(), "Checking the tests");
        assert_eq!(*shown.lock().unwrap(), "Done.");
    }

    #[test]
    fn reasoning_outside_a_forwarding_turn_goes_nowhere() {
        let (mut on_chunk, shown) = answer_recorder();
        let mut resolved_model = None;
        let mut on_event = stream_event_handler(&mut on_chunk, None, &mut resolved_model, None);
        on_event(StreamEvent::ReasoningDelta {
            text: "private".to_string(),
        });
        drop(on_event);
        assert!(shown.lock().unwrap().is_empty());
    }

    #[test]
    fn reasoning_cut_off_by_the_end_of_the_stream_is_still_reasoning() {
        let mut thinking = InlineThinking::default();
        assert_eq!(thinking.push("<thinking>half a thought </thi"), "");
        assert_eq!(thinking.take_thought(), "half a thought ");
        assert_eq!(thinking.finish(), "");
        assert_eq!(thinking.take_thought(), "</thi");
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
    fn no_turn_is_carried_by_a_sign_in_its_route_did_not_name() {
        for source in [
            include_str!("streaming.rs"),
            include_str!("provider_dispatch.rs"),
        ] {
            let production = source.split("#[cfg(test)]").next().unwrap_or(source);
            assert!(!production.contains("resolve_auth("));
            assert!(!production.contains("via_subscription = true"));
            assert!(!production.contains("githubcopilot"));
        }
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

    fn fixture_request<'a>(model: &'a str, messages: &'a [Message]) -> ChatRequest<'a> {
        ChatRequest {
            model,
            messages,
            max_tokens: 1024,
            temperature: None,
            tools: None,
            tool_choice: None,
            thinking_budget: None,
            anthropic_thinking: None,
            effort: None,
            top_p: None,
            top_k: None,
            metadata: None,
            reasoning_effort: None,
            gemini_thinking_budget: None,
            num_ctx: None,
            ollama_think: None,
            idle_timeout: STREAM_IDLE_TIMEOUT,
        }
    }

    fn catalog_models_with(parameter: EffortParameter) -> Vec<&'static str> {
        crate::model_catalog::catalog()
            .all()
            .iter()
            .filter(|model| crate::model_catalog::effort_parameter(&model.id) == Some(parameter))
            .map(|model| model.id.as_str())
            .collect()
    }

    fn catalog_level(model: &str, effort: Effort) -> Option<String> {
        match crate::model_catalog::effort_support(model) {
            EffortSupport::Levels(levels) => {
                crate::model_catalog::nearest_supported_effort(effort.wire_value(), &levels)
                    .map(str::to_string)
            }
            _ => None,
        }
    }

    #[test]
    fn an_own_key_anthropic_turn_sends_the_chosen_effort_and_never_a_thinking_budget() {
        let messages = [Message::text("user", "fixture prompt")];
        let models = catalog_models_with(EffortParameter::OutputConfigEffort);
        assert!(!models.is_empty());
        let route = ReasoningRoute::of_spec(&anthropic_spec("k"));
        for model in models {
            for effort in Effort::ALL.iter().copied() {
                let wire = reasoning_wire(
                    route,
                    model,
                    Some(effort),
                    effort.thinking_budget_for_anthropic(),
                );
                let mut req = fixture_request(model, &messages);
                wire.apply(&mut req);
                let body = agiworkforce_llm::build_anthropic_request_body(&req);
                assert!(body.get("thinking").is_none(), "{model} {effort:?}: {body}");
                let expected = catalog_level(model, effort);
                assert!(expected.is_some(), "{model} {effort:?}");
                assert_eq!(
                    body.pointer("/output_config/effort")
                        .and_then(serde_json::Value::as_str),
                    expected.as_deref(),
                    "{model} {effort:?}"
                );
            }
        }
    }

    #[test]
    fn an_own_key_chat_completions_turn_sends_reasoning_effort_where_the_catalog_names_it() {
        let spec = openai_compat_spec(
            "fixture-compatible",
            "https://provider.example/v1/chat/completions",
            "k",
        );
        let route = ReasoningRoute::of_spec(&spec);
        let models = catalog_models_with(EffortParameter::ReasoningEffort);
        assert!(!models.is_empty());
        for model in models {
            let wire = reasoning_wire(route, model, Some(Effort::High), None);
            let sent = wire
                .spec_for(&spec)
                .expect("reasoning effort rides in the body");
            let level = sent
                .extra_body
                .iter()
                .find(|(field, _)| field == "reasoning_effort")
                .and_then(|(_, value)| value.as_str());
            assert!(level.is_some(), "{model}: {:?}", sent.extra_body);
            if let Some(expected) = catalog_level(model, Effort::High) {
                assert_eq!(level, Some(expected.as_str()), "{model}");
            }
        }
        let uncataloged = reasoning_wire(
            route,
            "fixture-local-model:latest",
            Some(Effort::High),
            None,
        );
        assert!(uncataloged.spec_for(&spec).is_none());
    }

    #[test]
    fn a_managed_turn_tells_the_gateway_the_chosen_effort() {
        let spec = managed_cloud_spec_for_base("test-jwt", "https://agiworkforce.com")
            .expect("a trusted host resolves");
        let route = ReasoningRoute::of_spec(&spec);
        assert_eq!(route, ReasoningRoute::Managed);
        let model = catalog_models_with(EffortParameter::OutputConfigEffort)
            .into_iter()
            .next()
            .expect("a catalog model with effort levels");
        let sent = reasoning_wire(route, model, Some(Effort::Max), None)
            .spec_for(&spec)
            .expect("effort rides in the managed body");
        let expected = catalog_level(model, Effort::Max).expect("catalog level");
        assert!(sent
            .extra_body
            .contains(&("effort".to_string(), serde_json::Value::String(expected))));
        assert_eq!(managed_request_id(&sent), managed_request_id(&spec));
    }

    #[test]
    fn a_gemini_turn_sends_a_thinking_budget_only_where_the_catalog_takes_one() {
        let messages = [Message::text("user", "fixture prompt")];
        let route = ReasoningRoute::of_spec(&gemini_spec("k"));
        let models = catalog_models_with(EffortParameter::ThinkingLevel);
        assert!(!models.is_empty());
        for model in models {
            let wire = reasoning_wire(route, model, Some(Effort::High), None);
            let mut req = fixture_request(model, &messages);
            wire.apply(&mut req);
            let body = agiworkforce_llm::build_gemini_request_body(&req);
            let budget = body.pointer("/generationConfig/thinkingConfig/thinkingBudget");
            assert_eq!(
                budget.is_some(),
                crate::model_catalog::accepts_thinking_budget(model),
                "{model}: {body}"
            );
        }
    }

    #[test]
    fn effort_reaches_a_model_only_through_a_parameter_its_route_sends() {
        for model in catalog_models_with(EffortParameter::OutputConfigEffort) {
            assert!(effort_reaches_model(
                &Provider::Anthropic,
                model,
                Effort::High
            ));
            assert!(effort_reaches_model(
                &Provider::ManagedCloud,
                model,
                Effort::Low
            ));
            assert!(!effort_reaches_model(
                &Provider::Ollama(OllamaMode::Local),
                model,
                Effort::High
            ));
        }
        for model in catalog_models_with(EffortParameter::ThinkingLevel) {
            assert_eq!(
                effort_reaches_model(&Provider::Google, model, Effort::High),
                crate::model_catalog::accepts_thinking_budget(model),
                "{model}"
            );
        }
        assert!(!effort_reaches_model(
            &crate::models::openai_provider(),
            "fixture-local-model:latest",
            Effort::High
        ));
    }

    #[test]
    fn a_context_overflow_names_the_catalog_window_of_the_model() {
        let entry = crate::model_catalog::catalog()
            .all()
            .first()
            .expect("a catalog model");
        let err = map_llm_error(LlmError::ContextOverflow {
            model: entry.id.clone(),
        });
        match err.downcast_ref::<CliError>() {
            Some(CliError::ContextOverflow { limit, .. }) => {
                assert_eq!(*limit, entry.context_window)
            }
            other => panic!("not a context overflow: {other:?}"),
        }
    }
}
