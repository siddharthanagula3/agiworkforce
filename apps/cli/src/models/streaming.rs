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
        // per spec, and a spec is built per request, so a retry of one request
        // reuses its key while two turns never share one.
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
            crate::model_catalog::nearest_supported_effort(
                &effort.label().to_ascii_lowercase(),
                levels,
            )
        }
        (_, effort) => effort.map(|e| e.openai_effort_str()),
    };
    let searching = search_turn()
        && spec.id != super::provider_name(&Provider::ManagedCloud)
        && tools.is_some_and(|tools| tools.iter().any(|tool| tool.name == WEB_SEARCH_TOOL));
    let forced_search = searching
        && crate::model_catalog::accepts_forced_tool_choice(model)
        && !(matches!(spec.dialect, Dialect::Anthropic) && thinking_budget.is_some());
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
        tool_choice: forced_search.then(|| ToolChoice::Specific(WEB_SEARCH_TOOL.to_string())),
        anthropic_thinking: None,
        effort: None,
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
    let mut on_event = stream_event_handler(on_chunk, pause, &mut resolved_model);
    let outcome = stream_chat(client, spec, &req, &mut on_event).await;
    drop(on_event);
    match outcome {
        Ok(outcome) => Ok(CompletionResult {
            resolved_model,
            ..completion_result_from(outcome)
        }),
        Err(err) => Err(map_llm_error(err)),
    }
}

fn stream_event_handler<'a>(
    on_chunk: &'a mut StreamCallback,
    mut pause: Option<&'a mut ManagedApprovalPause>,
    resolved_model: &'a mut Option<String>,
) -> impl FnMut(StreamEvent) + Send + 'a {
    move |event| match event {
        StreamEvent::TextDelta { text } => on_chunk(&text),
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
        let mut on_event = stream_event_handler(on_chunk, Some(&mut pause), &mut resolved_model);
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
        let next = next.map_err(map_llm_error)?;
        absorb_continuation(
            &mut completed,
            CompletionResult {
                resolved_model,
                ..completion_result_from(next)
            },
        );
    }
    Ok(completed)
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
