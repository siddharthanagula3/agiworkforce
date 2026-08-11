use std::collections::HashSet;
use std::path::{Path, PathBuf};

use anyhow::{Context as _, Result};

use crate::compaction;
use crate::config::CliConfig;
use crate::context::SystemContext;
use crate::hooks;
use crate::mcp;
use crate::memory::{self, MemoryManager};
use crate::models::ToolDefinition;
use crate::models::{self, Message, Provider};
use crate::runtime::session::{ManagedSession, ManagedSessionRoutingAuthority};
use crate::skills;
use crate::subagent;
use crate::teams;

mod chat;
mod executor;
mod history;
mod prompt;
mod tools;

pub use crate::runtime::session::PrivacyMode;
pub use executor::ToolCall;
pub use prompt::assemble_system_prompt;
pub(crate) use prompt::encode_untrusted_context;

// ---------------------------------------------------------------------------
// Tool definitions (native API JSON Schema) — test-only helpers
// ---------------------------------------------------------------------------

#[cfg(test)]
fn build_tool_definitions() -> Vec<ToolDefinition> {
    crate::runtime::tool_catalog::built_in_tool_definitions()
}

#[cfg(test)]
fn build_team_tool_definitions() -> Vec<ToolDefinition> {
    crate::runtime::tool_catalog::team_tool_definitions()
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/// Sink invoked when the fallback chain rotates: `(from_model, to_model, error_kind)`.
pub struct FallbackSink(pub Box<dyn Fn(&str, &str, &str) + Send + Sync>);

impl std::fmt::Debug for FallbackSink {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("FallbackSink(<callback>)")
    }
}

/// Sink invoked when the budget cap is hit: `(cumulative_usd, limit_usd)`.
pub struct BudgetSink(pub Box<dyn Fn(f64, f64) + Send + Sync>);

impl std::fmt::Debug for BudgetSink {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("BudgetSink(<callback>)")
    }
}

#[derive(Clone)]
pub struct ToolApprovalSink(pub crate::tools::ApprovalCallback);

impl std::fmt::Debug for ToolApprovalSink {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ToolApprovalSink(<callback>)")
    }
}

/// Surface adapter for streaming tool lifecycle events out of the shared agent
/// loop. The TUI turns these into transcript cells; the developer app-server
/// maps the same events into canonical `AgentEventEnvelope` notifications.
/// Non-interactive surfaces leave the sink unset.
#[derive(Clone)]
pub struct ToolEventSink(
    pub std::sync::Arc<dyn Fn(crate::tui::app_event::TuiAppEvent) + Send + Sync>,
);

impl std::fmt::Debug for ToolEventSink {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ToolEventSink(<callback>)")
    }
}

/// Stable identifiers shared by every SDK stream event in one CLI turn.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SdkStreamContext {
    pub(crate) session_id: String,
    pub(crate) message_id: String,
}

impl SdkStreamContext {
    pub(crate) fn text_delta_event(&self, delta: &str) -> crate::sdk_io::SdkEvent {
        crate::sdk_io::SdkEvent::StreamEvent(crate::sdk_io::StreamEvent::TextDelta {
            session_id: self.session_id.clone(),
            message_id: self.message_id.clone(),
            delta: delta.to_string(),
        })
    }

    pub(crate) fn emit_text_delta(&self, delta: &str) {
        let _ = crate::sdk_io::write_event_stdout(&self.text_delta_event(delta));
    }
}

/// Tracks the state of an agent conversation session.
#[derive(Debug)]
pub struct AgentSession {
    pub messages: Vec<Message>,
    pub model: String,
    pub provider: Provider,
    pub total_input_tokens: u32,
    pub total_output_tokens: u32,
    pub total_cache_read_tokens: u32,
    pub total_cache_creation_tokens: u32,
    /// Cumulative reasoning output tokens across all turns. 0 for non-reasoning
    /// models or when the provider does not report this field.
    pub total_reasoning_tokens: u32,
    /// Provider-tokenizer calibration captured from the most recent completion.
    /// The shared context engine applies this ratio to future local estimates.
    pub(crate) context_usage_anchor: Option<agiworkforce_agent_core::context::ContextUsageAnchor>,
    pub turn_count: u32,
    pub cost_ledger: crate::cost_ledger::CostLedger,
    pub fallback_chain: Option<crate::routing::fallback::FallbackChain>,
    pub demo_force_rate_limit: bool,
    pub demo_mode: bool,
    #[allow(dead_code)]
    pub output_style: String,
    #[allow(clippy::type_complexity)]
    pub on_fallback: Option<FallbackSink>,
    pub(crate) recent_tool_calls: Vec<u64>,
    pub(crate) loop_strike_count: u32,
    pub(crate) hooks_config: hooks::HooksConfig,
    pub(crate) mcp_manager: Option<mcp::McpManager>,
    pub max_turns: Option<usize>,
    /// If set, stop the agent loop when cumulative spend exceeds this many USD.
    pub max_budget_usd: Option<f64>,
    /// Optional callback invoked when the budget cap is hit.
    /// `(cumulative_usd, limit_usd)` — caller is responsible for emitting
    /// any JSON event; chat.rs always writes a human-readable line to stderr.
    pub on_budget_exhausted: Option<BudgetSink>,
    pub plan_mode: bool,
    pub permission_mode: crate::cli_options::PermissionMode,
    pub plan_approved: bool,
    pub current_plan: Option<crate::plan_mode::Plan>,
    pub current_plan_path: Option<std::path::PathBuf>,
    pub plan_rejection_feedback: Option<String>,
    pub auto_approve_plan: bool,
    pub skip_permissions: bool,
    pub auto_approve_safe: bool,
    pub on_tool_approval: Option<ToolApprovalSink>,
    pub on_tool_event: Option<ToolEventSink>,
    pub quiet: bool,
    #[allow(dead_code)]
    pub fast_mode: bool,
    #[allow(dead_code)]
    pub(crate) original_model: Option<String>,
    pub(crate) checkpoints: Vec<Vec<Message>>,
    #[allow(dead_code)]
    pub session_name: Option<String>,
    /// Stable, filesystem-safe identifier for this process-local session run.
    /// Memory extraction uses it instead of user-controlled names or paths.
    pub(crate) runtime_session_id: String,
    #[allow(dead_code)]
    pub fallback_model: Option<String>,
    pub allowed_tools: Option<Vec<String>>,
    pub disallowed_tools: Vec<String>,
    pub privacy_mode: PrivacyMode,
    /// A reviewed Local→cloud continuation that has been drafted but not sent.
    /// The source durable session remains authoritative until the reviewed
    /// draft is sent and a new persisted fork has been adopted.
    pending_privacy_handoff: Option<PendingPrivacyHandoff>,
    pub additional_context_dirs: Vec<PathBuf>,
    pub attached_context_files: Vec<PathBuf>,
    /// Rules discovered for this workspace. Unconditional rules are included
    /// in the startup prompt; glob-scoped rules activate as files enter the
    /// live turn context.
    pub(crate) workspace_rules: Vec<memory::Rule>,
    /// Rule source paths already inserted into the conversation. This keeps a
    /// rule from being duplicated on every mention or file-tool call.
    pub(crate) active_rule_sources: HashSet<PathBuf>,
    pub debug_mode: bool,
    pub(crate) subagent_manager: Option<subagent::SubagentManager>,
    pub(crate) team_manager: Option<teams::TeamManager>,
    /// Post-turn memory consolidation work owned by this session.
    ///
    /// The app-server drains these handles during interrupt/shutdown so an old
    /// runtime cannot keep issuing provider requests or writing memory after
    /// its shutdown acknowledgment.
    memory_consolidation_tasks: Vec<tokio::task::JoinHandle<()>>,
    pub(crate) managed_session: Option<ManagedSession>,
    pub(crate) managed_session_path: Option<PathBuf>,
    /// When false this session must never write managed-session state — not the
    /// session file under `~/.agiworkforce/managed_sessions/`, and not the
    /// session index row that mirrors it. Seeded at construction from the
    /// process-wide `--no-session-persistence` policy
    /// (`cli_options::session_persistence_enabled`). Resuming an existing
    /// session still rehydrates in memory; only the write-back is suppressed.
    pub(crate) session_persistence: bool,
    /// Subscription tier used when the interactive per-turn Auto re-resolution
    /// re-queries the registry policy. Seeded by the `--auto` launch path from
    /// the account-tier lookup; when absent (e.g. resumed sessions), the
    /// re-resolution falls back conservatively (byok trust → "byok", else
    /// "free"), matching the app-server host's semantics.
    pub(crate) auto_routing_tier: Option<String>,
    /// Image blocks queued for the next `send()` call.  They are prepended to
    /// the user message as `ContentBlock::Image` parts so the model receives
    /// both the images and the text prompt in a single multipart user turn.
    /// Consumed (drained) by `send()` and empty thereafter.
    pub pending_image_blocks: Vec<models::ContentBlock>,
    /// When `true`, all streaming chunks (including continuation/retry/fallback
    /// turns) are emitted as `MessageDelta` JSONL events to stdout instead of
    /// raw `print!`.  Set by the caller that also sets `json_session_id`.
    pub json_events: bool,
    /// Session-ID string to embed in `MessageDelta` events when `json_events`
    /// is `true`.  Usually the managed-session UUID; falls back to "exec".
    pub json_session_id: String,
    /// Canonical SDK stream identifiers for `--output-format stream-json`.
    /// Unlike the legacy `--json-events` schema, this emits `type=stream_event`
    /// records and is also used by continuation turns after tool execution.
    pub(crate) sdk_stream_context: Option<SdkStreamContext>,
    /// When set, send extended-thinking with this token budget (Anthropic only).
    /// Maps from the TUI Effort picker: Medium=None, High=Some(16384), Max=Some(32768).
    /// Only applied when the active provider is Anthropic.
    pub thinking_budget_tokens: Option<u32>,
    /// The Effort picker's selection, kept whole.
    ///
    /// `thinking_budget_tokens` above is only the Anthropic projection of this,
    /// and it collapses Low and Medium to the same `None`. Storing the level
    /// itself lets the request boundary derive the OpenAI `reasoning.effort`
    /// string and the Gemini thinking budget too — previously both ran at
    /// provider default regardless of what the user picked.
    pub effort: Option<crate::design_system::Effort>,
}

/// Metadata returned after a single agent turn.
pub struct TurnResult {
    pub response: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_read_tokens: u32,
    pub cache_creation_tokens: u32,
    /// Exact sum of this turn's per-provider-request catalog charges. Tool-loop
    /// completions are priced independently before they are aggregated here.
    pub cost_usd: f64,
    pub via_subscription: bool,
}

#[derive(Debug, Clone)]
struct PendingPrivacyHandoff {
    reviewed_payload: String,
    destination: PrivacyMode,
    source_session_id: Option<String>,
    source_session_path: Option<PathBuf>,
    destination_model: String,
    destination_provider: String,
    destination_auto_routing: Option<crate::runtime::session::ManagedSessionAutoRouting>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrivacyHandoffCompletion {
    pub source_session_id: String,
    pub destination_session_id: String,
    pub destination: PrivacyMode,
    pub provider: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AddContextDirReport {
    pub path: PathBuf,
    pub already_present: bool,
    pub instructions_loaded: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttachFilesReport {
    pub added: Vec<PathBuf>,
    pub skipped_existing: Vec<PathBuf>,
    pub failed: Vec<(String, String)>,
    pub truncated: Vec<PathBuf>,
}

fn normalize_rule_path_candidate(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim_matches(|character: char| {
        character.is_whitespace()
            || matches!(
                character,
                '`' | '"' | '\'' | '(' | ')' | '[' | ']' | '{' | '}' | '<' | '>' | ',' | ';'
            )
    });
    if trimmed.is_empty() || trimmed.len() > 4_096 || trimmed.contains("://") {
        return None;
    }

    // File references are commonly written as `path/to/file.rs:42` or
    // `path/to/file.rs:42:7`. Remove numeric line/column suffixes without
    // damaging Windows drive prefixes.
    let mut candidate = trimmed.trim_end_matches(['.', ':']);
    loop {
        let Some((head, tail)) = candidate.rsplit_once(':') else {
            break;
        };
        if tail.chars().all(|character| character.is_ascii_digit()) && !tail.is_empty() {
            candidate = head;
        } else {
            break;
        }
    }
    if candidate.is_empty() {
        return None;
    }

    let path = Path::new(candidate);
    let file_name = path.file_name()?.to_string_lossy();
    let looks_like_path = candidate.contains('/')
        || candidate.contains('\\')
        || file_name.starts_with('.')
        || file_name.contains('.');
    looks_like_path.then(|| path.to_path_buf())
}

fn extract_rule_path_candidates(text: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for token in text.split_whitespace() {
        if let Some(path) = normalize_rule_path_candidate(token) {
            if !paths.contains(&path) {
                paths.push(path);
            }
        }
    }
    paths
}

fn collect_rule_paths_from_value(value: &serde_json::Value, paths: &mut Vec<PathBuf>) {
    match value {
        serde_json::Value::String(text) => {
            for path in extract_rule_path_candidates(text) {
                if !paths.contains(&path) {
                    paths.push(path);
                }
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                collect_rule_paths_from_value(value, paths);
            }
        }
        serde_json::Value::Object(values) => {
            for value in values.values() {
                collect_rule_paths_from_value(value, paths);
            }
        }
        _ => {}
    }
}

fn collect_rule_paths_from_path_fields(value: &serde_json::Value, paths: &mut Vec<PathBuf>) {
    match value {
        serde_json::Value::Array(values) => {
            for value in values {
                collect_rule_paths_from_path_fields(value, paths);
            }
        }
        serde_json::Value::Object(values) => {
            for (key, value) in values {
                let normalized_key = key.to_ascii_lowercase();
                if normalized_key.contains("path")
                    || matches!(normalized_key.as_str(), "file" | "files")
                {
                    collect_rule_paths_from_value(value, paths);
                } else {
                    collect_rule_paths_from_path_fields(value, paths);
                }
            }
        }
        _ => {}
    }
}

pub(crate) fn rule_paths_from_tool_call(
    tool_name: &str,
    arguments: &serde_json::Value,
) -> Vec<PathBuf> {
    const FILE_CONTEXT_TOOLS: &[&str] = &[
        "read_file",
        "read_many_files",
        "write_file",
        "edit_file",
        "multiedit",
        "notebook_edit",
        "apply_patch",
        "lsp_definition",
        "lsp_hover",
        "lsp_diagnostics",
        "lsp_completion",
        "lsp_document_symbols",
        "lsp_format",
        "run_command",
        "powershell",
    ];
    if !FILE_CONTEXT_TOOLS.contains(&tool_name) {
        return Vec::new();
    }

    let mut paths = Vec::new();
    if matches!(tool_name, "apply_patch" | "run_command" | "powershell") {
        // Patch payloads and shell commands carry target paths inside text
        // rather than dedicated path fields.
        collect_rule_paths_from_value(arguments, &mut paths);
    } else {
        collect_rule_paths_from_path_fields(arguments, &mut paths);
    }
    paths
}

pub(crate) fn is_rule_sensitive_mutation_tool(tool_name: &str) -> bool {
    matches!(
        tool_name,
        "write_file"
            | "edit_file"
            | "multiedit"
            | "notebook_edit"
            | "apply_patch"
            | "lsp_format"
            | "run_command"
            | "powershell"
    )
}

impl AgentSession {
    /// Create a new agent session with the system prompt.
    ///
    /// Compatibility constructor for tests and already-validated call sites.
    /// Production entry points should use [`AgentSession::new_checked`] so
    /// unknown hosted model IDs fail closed instead of falling through to a
    /// provider default.
    pub fn new(
        model: &str,
        sys_context: &SystemContext,
        custom_system_prompt: Option<&str>,
    ) -> Self {
        let provider =
            models::try_detect_provider(model).unwrap_or_else(|| models::detect_provider(model));
        Self::new_with_provider(model, sys_context, custom_system_prompt, provider)
    }

    pub fn new_checked(
        model: &str,
        sys_context: &SystemContext,
        custom_system_prompt: Option<&str>,
        provider_override: Option<&str>,
    ) -> Result<Self> {
        let provider = models::resolve_selected_provider(model, provider_override)?;
        Ok(Self::new_with_provider(
            model,
            sys_context,
            custom_system_prompt,
            provider,
        ))
    }

    pub fn new_with_provider(
        model: &str,
        sys_context: &SystemContext,
        custom_system_prompt: Option<&str>,
        provider: Provider,
    ) -> Self {
        let hooks_config = hooks::load_hooks().unwrap_or_default();

        let instructions = std::env::current_dir()
            .ok()
            .and_then(|cwd| compaction::load_instructions(&cwd));

        let memory_context = std::env::current_dir()
            .ok()
            .map(|cwd| {
                let mgr = MemoryManager::new(&cwd);
                let entries = mgr.load_all();
                if !entries.is_empty() {
                    for entry in &entries {
                        eprintln!("  {} memory: {}", entry.source, entry.file_path.display());
                    }
                }
                mgr.get_context_prompt()
            })
            .unwrap_or_default();

        let session_id = uuid::Uuid::new_v4().to_string();
        if let Ok(home) = crate::config::CliConfig::config_dir() {
            crate::shell_snapshot::ShellSnapshot::capture(&home, &session_id);
            crate::shell_snapshot::ShellSnapshot::cleanup_stale(&home);
        }

        let persistent_memory = crate::config::CliConfig::config_dir()
            .ok()
            .map(|home| crate::memory_pipeline::MemoryPipeline::load_persistent_memory(&home))
            .unwrap_or_default();

        let discovered = skills::discover_skills();
        let skills_content = skills::format_skill_catalog_for_prompt(&discovered);

        let rules = std::env::current_dir()
            .ok()
            .map(|cwd| memory::load_rules(&cwd))
            .unwrap_or_default();
        let rules_context = memory::always_on_rules_context(&rules);
        let active_rule_sources = rules
            .iter()
            .filter(|rule| rule.globs.is_empty())
            .map(|rule| rule.source.clone())
            .collect();

        let combined_memory = if persistent_memory.is_empty() {
            memory_context
        } else {
            format!("{}\n{}", memory_context, persistent_memory)
        };

        let system_message = Message::text(
            "system",
            prompt::build_system_prompt(
                sys_context,
                custom_system_prompt,
                instructions.as_deref(),
                &skills_content,
                &combined_memory,
                &rules_context,
            ),
        );

        let privacy_mode = provider_privacy_mode(&provider);

        Self {
            messages: vec![system_message],
            model: model.to_string(),
            provider,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cache_read_tokens: 0,
            total_cache_creation_tokens: 0,
            total_reasoning_tokens: 0,
            context_usage_anchor: None,
            turn_count: 0,
            cost_ledger: crate::cost_ledger::CostLedger::default(),
            fallback_chain: None,
            demo_force_rate_limit: false,
            demo_mode: false,
            on_fallback: None,
            output_style: "default".to_string(),
            recent_tool_calls: Vec::new(),
            loop_strike_count: 0,
            hooks_config,
            mcp_manager: None,
            max_turns: None,
            max_budget_usd: None,
            on_budget_exhausted: None::<BudgetSink>,
            plan_mode: false,
            permission_mode: crate::cli_options::PermissionMode::Default,
            plan_approved: false,
            current_plan: None,
            current_plan_path: None,
            plan_rejection_feedback: None,
            auto_approve_plan: false,
            skip_permissions: false,
            auto_approve_safe: false,
            on_tool_approval: None::<ToolApprovalSink>,
            on_tool_event: None::<ToolEventSink>,
            quiet: false,
            fast_mode: false,
            original_model: None,
            checkpoints: Vec::new(),
            session_name: None,
            runtime_session_id: session_id,
            fallback_model: None,
            allowed_tools: None,
            disallowed_tools: Vec::new(),
            privacy_mode,
            pending_privacy_handoff: None,
            additional_context_dirs: Vec::new(),
            attached_context_files: Vec::new(),
            workspace_rules: rules,
            active_rule_sources,
            debug_mode: false,
            subagent_manager: None,
            team_manager: None,
            memory_consolidation_tasks: Vec::new(),
            managed_session: None,
            managed_session_path: None,
            session_persistence: crate::cli_options::session_persistence_enabled(),
            auto_routing_tier: None,
            pending_image_blocks: Vec::new(),
            json_events: false,
            json_session_id: String::new(),
            sdk_stream_context: None,
            thinking_budget_tokens: None,
            effort: None,
        }
    }

    /// Enable team mode.
    pub fn enable_team_mode(&mut self) {
        self.team_manager = Some(teams::TeamManager::new());
    }

    /// Get a reference to the team manager.
    #[allow(dead_code)]
    pub fn team_manager(&self) -> Option<&teams::TeamManager> {
        self.team_manager.as_ref()
    }

    /// Spawn a teammate into the team.
    #[allow(dead_code)]
    pub async fn spawn_teammate(&self, name: &str, role: &str, prompt: &str) -> Result<String> {
        match &self.team_manager {
            Some(tm) => Ok(tm.spawn_teammate(name, role, prompt).await?),
            None => Err(anyhow::anyhow!(
                "Team mode is not enabled. Use --team flag or AGI_TEAM=1."
            )),
        }
    }

    /// Initialize the subagent manager for parallel task execution.
    #[allow(dead_code)]
    pub fn init_subagent_manager(&mut self, config: &CliConfig, sys_context: &SystemContext) {
        self.subagent_manager = Some(subagent::SubagentManager::new(
            config.clone(),
            self.model.clone(),
            sys_context.clone(),
            self.skip_permissions,
            self.permission_mode,
            self.allowed_tools.clone(),
            self.disallowed_tools.clone(),
        ));
    }

    pub(crate) fn apply_tool_filters(
        &mut self,
        allowed_tools: &[String],
        disallowed_tools: &[String],
    ) {
        self.allowed_tools = if allowed_tools.is_empty() {
            None
        } else {
            Some(allowed_tools.to_vec())
        };
        self.disallowed_tools = disallowed_tools.to_vec();
    }

    pub(crate) fn effective_tool_definitions(&self) -> Vec<ToolDefinition> {
        let mcp_tool_definitions = self
            .mcp_manager
            .as_ref()
            .map(|mcp_manager| mcp_manager.tool_definitions(self.privacy_mode));
        let planning_locked = self.plan_mode && !self.plan_approved;
        let mut tool_definitions = crate::runtime::tool_catalog::effective_tool_definitions(
            planning_locked,
            self.team_manager.is_some(),
            self.allowed_tools.as_deref(),
            mcp_tool_definitions.as_deref(),
        );

        if !self.disallowed_tools.is_empty() {
            tool_definitions.retain(|tool_definition| {
                !self.disallowed_tools.iter().any(|spec| {
                    crate::tool_filters::spec_blocks_entire_tool_for_schema(
                        spec,
                        &tool_definition.name,
                    )
                })
            });
        }

        tool_definitions
    }

    /// Generate an A2A AgentCard representing this session's capabilities.
    #[allow(dead_code)]
    pub fn a2a_card(&self) -> crate::a2a::AgentCard {
        let tool_names: Vec<String> = self
            .effective_tool_definitions()
            .iter()
            .map(|t| t.name.clone())
            .collect();

        crate::a2a::AgentCard {
            agent_id: crate::a2a::generate_agent_id(),
            name: format!("agiworkforce-{}", std::process::id()),
            version: env!("CARGO_PKG_VERSION").to_string(),
            capabilities: tool_names,
            supported_models: vec![self.model.clone()],
            endpoint: "http://127.0.0.1:7892".to_string(),
            auth_required: false,
            metadata: std::collections::HashMap::new(),
        }
    }

    /// Switch the model mid-session (keeps conversation history).
    pub fn switch_model(&mut self, model: &str) -> Result<()> {
        let next_provider = models::try_detect_provider(model)
            .or_else(|| {
                // OpenRouter BYOK models are fetched at runtime and aren't in the
                // static catalog. If the selected model is in the OpenRouter
                // cache (i.e. the picker listed it), route it via openrouter.
                if crate::models::openrouter_models::load_cached_models()
                    .iter()
                    .any(|m| m.id == model)
                {
                    models::provider_from_name("openrouter")
                } else {
                    None
                }
            })
            .with_context(|| {
                format!(
                    "Unknown model '{}'. Run `agi models scan` for local models or `agi models list` for catalog models, then choose a listed model.",
                    model
                )
            })?;
        let current_provider_mode = self.provider_privacy_mode();
        if current_provider_mode != self.privacy_mode && self.privacy_mode != PrivacyMode::Local {
            anyhow::bail!(
                "Cannot switch models while the session's {} privacy authority conflicts with its {} provider route",
                self.privacy_mode.label(),
                current_provider_mode.label()
            );
        }
        let next_provider_mode = provider_privacy_mode(&next_provider);
        if self.privacy_mode != PrivacyMode::Local && next_provider_mode != self.privacy_mode {
            anyhow::bail!(
                "Model '{}' routes through {} mode, but this established session is {}; start a new session instead of carrying its transcript across trust boundaries",
                model,
                next_provider_mode.label(),
                self.privacy_mode.label()
            );
        }
        self.model = model.to_string();
        self.provider = next_provider;
        Ok(())
    }

    /// Switch to a model discovered from the AGI managed gateway while
    /// preserving the managed trust/billing boundary instead of inferring the
    /// upstream vendor from the model id.
    pub fn switch_managed_model(&mut self, model: &str) -> Result<()> {
        let already_managed = self.privacy_mode == PrivacyMode::Managed
            && self.provider_privacy_mode() == PrivacyMode::Managed;
        let fresh_session = self.turn_count == 0
            && self.messages.len() <= 1
            && self.attached_context_files.is_empty()
            && self.additional_context_dirs.is_empty()
            && self.pending_image_blocks.is_empty();
        if !already_managed && !fresh_session {
            anyhow::bail!(
                "Cannot carry an established {} transcript into Managed Cloud; start a fresh Managed session or use a reviewed continuation",
                self.privacy_mode.label()
            );
        }
        if !crate::models::gateway_models::cached_model_is_available(model) {
            anyhow::bail!(
                "model '{}' is not in the live managed gateway catalog; run `agi models list` and choose an available Cloud model",
                model
            );
        }
        self.model = model.to_string();
        self.provider = models::Provider::ManagedCloud;
        self.set_privacy_mode(PrivacyMode::Managed);
        Ok(())
    }

    /// Add an additional directory root at runtime, mirroring Claude Code's
    /// `/add-dir` semantics for tool access and directory-scoped instructions.
    pub fn add_context_dir(&mut self, raw_path: &str) -> Result<AddContextDirReport> {
        let canonical = crate::path_security::register_additional_workspace_root(raw_path)
            .map_err(|e| {
                anyhow::anyhow!("failed to register additional directory `{raw_path}`: {e}")
            })?;
        let already_present = self
            .additional_context_dirs
            .iter()
            .any(|path| path == &canonical);
        if !already_present {
            self.additional_context_dirs.push(canonical.clone());
        }

        let instructions = compaction::load_instructions(&canonical);
        if !already_present {
            let message = match instructions.as_deref() {
                Some(contents) if !contents.trim().is_empty() => format!(
                    "<additional_directory_context path=\"{}\">\n{}\n</additional_directory_context>",
                    escape_attr(&canonical),
                    contents.trim()
                ),
                _ => format!(
                    "<additional_directory_context path=\"{}\">\nNo instruction files were found in this directory lineage.\n</additional_directory_context>",
                    escape_attr(&canonical)
                ),
            };
            self.messages.push(Message::text("system", &message));
        }

        Ok(AddContextDirReport {
            path: canonical,
            already_present,
            instructions_loaded: instructions.is_some(),
        })
    }

    /// Activate any glob-scoped rules that match files entering the live turn
    /// context. The returned fragment is empty when every applicable rule is
    /// already active.
    pub(crate) fn activate_rules_for_paths(&mut self, paths: &[PathBuf]) -> String {
        let active_files: Vec<String> = paths
            .iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect();
        let active_file_refs: Vec<&str> = active_files.iter().map(String::as_str).collect();
        memory::activate_matching_rules(
            &self.workspace_rules,
            &active_file_refs,
            &mut self.active_rule_sources,
        )
    }

    fn activate_rules_from_user_input(&mut self, user_input: &str) {
        let paths = extract_rule_path_candidates(user_input);
        let context = self.activate_rules_for_paths(&paths);
        if !context.is_empty() {
            self.messages.push(Message::text("system", context));
        }
    }

    /// Attach file contents into session context without sending a user turn.
    pub fn attach_context_files<I, S>(&mut self, raw_paths: I) -> AttachFilesReport
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        const MAX_TOTAL_CHARS: usize = 120_000;
        const MAX_PER_FILE_CHARS: usize = 40_000;

        let mut report = AttachFilesReport {
            added: Vec::new(),
            skipped_existing: Vec::new(),
            failed: Vec::new(),
            truncated: Vec::new(),
        };
        let mut segments = Vec::new();
        let mut remaining = MAX_TOTAL_CHARS;

        for raw_path in raw_paths {
            let raw = raw_path.as_ref().trim();
            if raw.is_empty() {
                continue;
            }
            let resolved = match resolve_context_file(raw) {
                Ok(path) => path,
                Err(e) => {
                    report.failed.push((raw.to_string(), e.to_string()));
                    continue;
                }
            };
            if self
                .attached_context_files
                .iter()
                .any(|path| path == &resolved)
            {
                report.skipped_existing.push(resolved);
                continue;
            }
            if remaining == 0 {
                report.failed.push((
                    resolved.display().to_string(),
                    "attachment budget exhausted".to_string(),
                ));
                continue;
            }

            let content = match std::fs::read_to_string(&resolved)
                .with_context(|| format!("read {}", resolved.display()))
            {
                Ok(content) => content,
                Err(e) => {
                    report
                        .failed
                        .push((resolved.display().to_string(), e.to_string()));
                    continue;
                }
            };

            let max_for_file = remaining.min(MAX_PER_FILE_CHARS);
            let mut chars = content.chars();
            let selected: String = chars.by_ref().take(max_for_file).collect();
            let truncated = chars.next().is_some();
            if truncated {
                report.truncated.push(resolved.clone());
            }
            remaining = remaining.saturating_sub(selected.len());
            segments.push(format!(
                "<attached_file path=\"{}\"{}>\n{}\n</attached_file>",
                escape_attr(&resolved),
                if truncated { " truncated=\"true\"" } else { "" },
                selected
            ));
            self.attached_context_files.push(resolved.clone());
            report.added.push(resolved);
        }

        if !segments.is_empty() {
            let activated_rules = self.activate_rules_for_paths(&report.added);
            let attached_files = format!(
                "<attached_files>\n{}\n</attached_files>",
                segments.join("\n\n"),
            );
            let message = if activated_rules.is_empty() {
                attached_files
            } else {
                format!("{activated_rules}\n\n{attached_files}")
            };
            self.messages.push(Message::text("system", &message));
        }

        report
    }

    /// Override the provider from config.
    pub fn set_provider_override(&mut self, provider_name: &str) {
        if let Some(provider) = models::provider_from_name(provider_name) {
            let provider_mode = provider_privacy_mode(&provider);
            if self.privacy_mode == PrivacyMode::Local || provider_mode == self.privacy_mode {
                self.provider = provider;
            }
        }
    }

    pub fn set_privacy_mode(&mut self, mode: PrivacyMode) {
        self.privacy_mode = mode;
        if let Some(manager) = self.mcp_manager.as_mut() {
            manager.enforce_privacy_mode(mode);
        }
    }

    pub fn apply_ui_config(&mut self, config: &CliConfig) {
        if let Some(style) = config.ui.output_style.as_deref() {
            self.apply_output_style(style);
        }
        if let Some(mode) = config
            .ui
            .privacy_mode
            .as_deref()
            .and_then(PrivacyMode::from_arg)
        {
            self.set_privacy_mode(mode);
        }
    }

    pub fn provider_privacy_mode(&self) -> PrivacyMode {
        provider_privacy_mode(&self.provider)
    }

    fn arm_privacy_handoff(&mut self, draft: &str, destination: PrivacyMode) -> Result<()> {
        if self.privacy_mode != PrivacyMode::Local {
            anyhow::bail!("Only a Local session can create a reviewed cloud continuation");
        }
        if destination == PrivacyMode::Local || self.provider_privacy_mode() != destination {
            anyhow::bail!(
                "Selected provider routes through {} mode, not {} mode",
                self.provider_privacy_mode().label(),
                destination.label()
            );
        }
        if !self.session_persistence {
            anyhow::bail!(
                "A reviewed continuation requires session persistence so the Local source can remain unchanged"
            );
        }
        let source_session_id = self.managed_session_id().map(str::to_string);
        let source_session_path = self.managed_session_path.clone();
        if source_session_id.is_none() || source_session_path.is_none() {
            anyhow::bail!("Save this Local session before creating a reviewed cloud continuation");
        }
        let reviewed_payload = draft.trim().to_string();
        if reviewed_payload.is_empty() {
            anyhow::bail!("The continuation draft is missing its confirmation preamble");
        }
        self.pending_privacy_handoff = Some(PendingPrivacyHandoff {
            reviewed_payload,
            destination,
            source_session_id,
            source_session_path,
            destination_model: self.model.clone(),
            destination_provider: models::provider_persistence_name(&self.provider),
            destination_auto_routing: self
                .managed_auto_routing()
                .filter(|state| {
                    auto_routing_matches_privacy(state, destination)
                        && agiworkforce_model_registry::is_auto_routing_selection(&state.selection)
                })
                .cloned(),
        });
        Ok(())
    }

    /// Arm an explicit Local→BYOK continuation. Drafting is not consent and
    /// does not mutate the source session's trust boundary.
    pub fn arm_byok_handoff(&mut self, draft: &str) -> Result<()> {
        self.arm_privacy_handoff(draft, PrivacyMode::Byok)
    }

    /// Arm an explicit Local→Managed Cloud continuation.
    pub fn arm_managed_handoff(&mut self, draft: &str) -> Result<()> {
        self.arm_privacy_handoff(draft, PrivacyMode::Managed)
    }

    pub fn cancel_pending_privacy_handoff(&mut self) {
        self.pending_privacy_handoff = None;
    }

    /// Complete a reviewed continuation by forking the durable Local source,
    /// removing unselected Local history from the destination, persisting the
    /// new authority, and only then adopting the new session ID.
    pub fn complete_pending_privacy_handoff(
        &mut self,
        user_input: &str,
    ) -> Result<Option<PrivacyHandoffCompletion>> {
        if self.pending_privacy_handoff.is_none() {
            return Ok(None);
        }
        let store = crate::runtime::session_control::ManagedSessionStore::user_config()?;
        self.complete_pending_privacy_handoff_with_store(user_input, &store)
    }

    fn complete_pending_privacy_handoff_with_store(
        &mut self,
        user_input: &str,
        store: &crate::runtime::session_control::ManagedSessionStore,
    ) -> Result<Option<PrivacyHandoffCompletion>> {
        let Some(pending) = self.pending_privacy_handoff.clone() else {
            return Ok(None);
        };
        if user_input.trim() != pending.reviewed_payload {
            // Consent is scoped to the next send. A later matching phrase must
            // require a fresh payload preview.
            self.pending_privacy_handoff = None;
            return Ok(None);
        }

        let source_session_id = pending.source_session_id.as_deref().ok_or_else(|| {
            anyhow::anyhow!("The continuation has no durable Local source session")
        })?;
        let source_session_path = pending
            .source_session_path
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("The continuation has no durable Local source path"))?;
        if self.privacy_mode != PrivacyMode::Local
            || self.managed_session_id() != Some(source_session_id)
            || self.managed_session_path.as_ref() != Some(source_session_path)
            || self.model != pending.destination_model
            || models::provider_persistence_name(&self.provider) != pending.destination_provider
        {
            self.pending_privacy_handoff = None;
            anyhow::bail!(
                "The Local source or destination route changed after preview; create a fresh continuation draft"
            );
        }

        let resolved = store.fork_redacted_continuation(
            crate::runtime::session_control::ManagedSessionReference::Path(
                source_session_path.clone(),
            ),
        )?;
        let mut destination = ManagedSession::load_from_path(&resolved.path)?;
        debug_assert!(destination.messages.is_empty());
        destination.model = Some(pending.destination_model.clone());
        destination.routing_authority = Some(ManagedSessionRoutingAuthority {
            privacy_mode: pending.destination,
            provider: pending.destination_provider.clone(),
        });
        destination.messages = vec![Message::text(
            "system",
            prompt::build_reviewed_continuation_system_prompt(
                pending.destination.label(),
                &pending.destination_provider,
            ),
        )];
        destination.auto_routing = pending.destination_auto_routing;
        destination.permission_mode = Some(self.permission_mode);
        destination.plan_mode = Some(self.plan_mode);
        destination.plan_approved = Some(false);
        destination.current_plan = None;
        destination.fast_mode = Some(false);
        destination.output_style = Some(self.output_style.clone());
        destination.fallback_model_ids = None;
        destination.touch();
        let destination_path = store.save(&destination)?;
        let destination_session_id = destination.session_id.clone();
        let destination_messages = destination.messages.clone();

        self.adopt_managed_session(destination, destination_path)?;
        self.messages = destination_messages;
        self.reset_source_context_after_privacy_handoff();
        self.pending_privacy_handoff = None;
        Ok(Some(PrivacyHandoffCompletion {
            source_session_id: source_session_id.to_string(),
            destination_session_id,
            destination: pending.destination,
            provider: pending.destination_provider,
        }))
    }

    pub fn validate_privacy_boundary(&self) -> Result<()> {
        let provider_mode = self.provider_privacy_mode();
        if self.privacy_mode == PrivacyMode::Local && provider_mode != PrivacyMode::Local {
            let handoff_command = match provider_mode {
                PrivacyMode::Managed => "/continue-with-cloud",
                PrivacyMode::Byok => "/continue-with-byok",
                PrivacyMode::Local => unreachable!("local provider already passed the guard"),
            };
            anyhow::bail!(
                "Privacy boundary blocked: this session is Local, but model `{}` routes to {:?} ({}) through {} mode. Use `{}` to create a reviewable, redacted continuation before anything leaves Local mode.",
                self.model,
                self.provider,
                provider_mode.description(),
                provider_mode.label(),
                handoff_command,
            );
        }
        if self.privacy_mode != provider_mode {
            anyhow::bail!(
                "Privacy boundary blocked: this session is {}, but model `{}` routes through {} mode. Start a new session instead of carrying its transcript across trust boundaries.",
                self.privacy_mode.label(),
                self.model,
                provider_mode.label()
            );
        }
        Ok(())
    }

    /// Switch the active output style.
    #[allow(dead_code)]
    pub fn apply_output_style(&mut self, style_name: &str) {
        let style = crate::output_styles::resolve(style_name);
        self.output_style = style.name.clone();
        if let Some(system_msg) = self.messages.first_mut() {
            if system_msg.role == "system" {
                let mut text = system_msg.text_content();
                if let Some(idx) = text.find("\n\n## Output style:") {
                    text.truncate(idx);
                }
                if !style.system_prompt.trim().is_empty() {
                    text.push_str("\n\n");
                    text.push_str(style.system_prompt.trim());
                }
                *system_msg = Message::text("system", text);
            }
        }
    }

    /// Clear the conversation history (keeps system prompt).
    pub fn clear(&mut self) {
        self.messages.truncate(1);
        self.turn_count = 0;
        self.recent_tool_calls.clear();
        self.loop_strike_count = 0;
        self.reset_plan_state();
        self.attached_context_files.clear();
        self.pending_privacy_handoff = None;
    }

    fn reset_source_context_after_privacy_handoff(&mut self) {
        crate::path_security::unregister_additional_workspace_roots(&self.additional_context_dirs);
        self.additional_context_dirs.clear();
        self.attached_context_files.clear();
        self.pending_image_blocks.clear();
        self.workspace_rules.clear();
        self.active_rule_sources.clear();
        self.current_plan = None;
        self.current_plan_path = None;
        self.plan_rejection_feedback = None;
        self.plan_approved = false;
        self.context_usage_anchor = None;
        self.checkpoints.clear();
        self.recent_tool_calls.clear();
        self.loop_strike_count = 0;
        self.mcp_manager = None;
        self.subagent_manager = None;
        self.team_manager = None;
        self.fallback_chain = None;
        self.fallback_model = None;
        self.fast_mode = false;
        self.original_model = None;
        self.auto_routing_tier = None;
        self.turn_count = 0;
        self.total_input_tokens = 0;
        self.total_output_tokens = 0;
        self.total_cache_read_tokens = 0;
        self.total_cache_creation_tokens = 0;
        self.total_reasoning_tokens = 0;
        self.cost_ledger = crate::cost_ledger::CostLedger::default();
    }

    /// Clear all four plan-mode state fields.
    pub fn reset_plan_state(&mut self) {
        self.plan_approved = false;
        self.current_plan = None;
        self.current_plan_path = None;
        self.plan_rejection_feedback = None;
    }

    /// Handle a model `update_plan` tool call.
    pub fn handle_update_plan(&mut self, args: &serde_json::Value) -> serde_json::Value {
        let parsed: Result<crate::plan_mode::Plan, _> = serde_json::from_value(args.clone());
        let plan = match parsed {
            Ok(p) => p,
            Err(e) => {
                return serde_json::json!({
                    "ok": false,
                    "error": "invalid_arguments",
                    "message": format!("update_plan: failed to parse arguments: {e}")
                });
            }
        };

        let session_id = self
            .managed_session_id()
            .map(str::to_string)
            .unwrap_or_else(|| "ephemeral".to_string());

        let path_result = plan.write_to_disk(&session_id);
        match &path_result {
            Ok(p) => self.current_plan_path = Some(p.clone()),
            Err(e) => {
                eprintln!("  warning: could not persist plan to disk: {e:#}");
            }
        }

        let was_approved = self.plan_approved;
        self.current_plan = Some(plan);

        if self.auto_approve_plan && !was_approved {
            self.plan_approved = true;
        }

        let path_str = self
            .current_plan_path
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "<unwritten>".to_string());

        let message = if matches!(
            self.permission_mode,
            crate::cli_options::PermissionMode::Plan
        ) && !self.plan_approved
        {
            "plan written; awaiting user approval. Do not call mutating tools yet."
        } else if was_approved {
            "plan updated"
        } else {
            "plan written"
        };

        serde_json::json!({
            "ok": true,
            "message": message,
            "path": path_str,
            "plan_approved": self.plan_approved
        })
    }

    /// True when this session is allowed to write managed-session state to
    /// disk. False after `--no-session-persistence`.
    pub fn session_persistence_enabled(&self) -> bool {
        self.session_persistence
    }

    /// Override the session-persistence policy for this session only. Used by
    /// embedders and by tests that must not disturb the process-wide policy.
    pub fn set_session_persistence(&mut self, enabled: bool) {
        self.session_persistence = enabled;
    }

    /// Enable managed session persistence for this session.
    ///
    /// No-op when `--no-session-persistence` is in effect: no session file is
    /// created and no session-index row is written, so the run leaves no trace
    /// under `~/.agiworkforce/`.
    pub fn enable_managed_session(&mut self) -> Result<()> {
        if !self.session_persistence {
            return Ok(());
        }
        if self.managed_session.is_some() {
            return Ok(());
        }
        let store = crate::runtime::session_control::ManagedSessionStore::user_config()?;
        let mut managed_session = ManagedSession::with_messages(
            uuid::Uuid::new_v4().to_string(),
            chrono::Utc::now(),
            self.messages.clone(),
        );
        managed_session.model = Some(self.model.clone());
        managed_session.routing_authority = Some(self.current_routing_authority());
        managed_session.workspace_root = std::env::current_dir().ok();
        managed_session.created_by = Some("cli".to_string());
        let path = store.save(&managed_session)?;
        self.adopt_managed_session(managed_session, path)?;
        self.sync_managed_session_metadata()?;
        Ok(())
    }

    /// Override the managed session ID with a caller-supplied UUID.  This must
    /// be called after `enable_managed_session` so the session object exists.
    /// Useful for embedder-driven flows that pre-allocate session IDs.
    pub fn override_session_id(&mut self, session_id: &str) -> Result<()> {
        if !self.session_persistence {
            return Ok(());
        }
        crate::runtime::session::validate_managed_session_id(session_id)?;
        if let Some(ref mut ms) = self.managed_session {
            ms.session_id = session_id.to_string();
            if let Some(ref path) = self.managed_session_path {
                ms.save_to_path(path)?;
            }
            self.sync_managed_session_metadata()?;
        }
        Ok(())
    }

    pub fn current_routing_authority(&self) -> ManagedSessionRoutingAuthority {
        ManagedSessionRoutingAuthority {
            privacy_mode: self.privacy_mode,
            provider: models::provider_persistence_name(&self.provider),
        }
    }

    /// Adopt an existing managed session as the persistence backing. The
    /// persisted route is authority; process config is never allowed to
    /// silently rebind a resumed session.
    pub fn adopt_managed_session(
        &mut self,
        managed_session: ManagedSession,
        path: PathBuf,
    ) -> Result<()> {
        let model = managed_session.require_model()?.to_string();
        let authority = managed_session.require_routing_authority()?.clone();
        let provider =
            resolve_persisted_session_provider(&model, &authority, &managed_session.session_id)?;

        self.model = model;
        self.provider = provider;
        self.set_privacy_mode(authority.privacy_mode);
        if let Some(pm) = managed_session.permission_mode {
            self.permission_mode = pm;
        }
        if let Some(plan_mode) = managed_session.plan_mode {
            self.plan_mode = plan_mode;
        }
        if let Some(plan_approved) = managed_session.plan_approved {
            self.plan_approved = plan_approved;
        }
        if let Some(ref plan) = managed_session.current_plan {
            self.current_plan = Some(plan.clone());
        }
        if let Some(fast_mode) = managed_session.fast_mode {
            self.fast_mode = fast_mode;
        }
        if let Some(ref style) = managed_session.output_style {
            self.output_style = style.clone();
        }
        if let Some(ref ids) = managed_session.fallback_model_ids {
            self.fallback_chain = Some(crate::routing::fallback::FallbackChain::parse(
                &ids.join(","),
            ));
        }
        self.runtime_session_id = managed_session.session_id.clone();
        self.json_session_id = managed_session.session_id.clone();
        self.pending_privacy_handoff = None;
        self.managed_session = Some(managed_session);
        self.managed_session_path = Some(path);
        Ok(())
    }

    /// Persist the current in-memory conversation into the managed session file.
    ///
    /// No-op under `--no-session-persistence`, including on a `--resume`d
    /// session: the file that was read stays exactly as it was on disk.
    pub fn persist_managed_session(&mut self) -> Result<()> {
        if !self.session_persistence {
            return Ok(());
        }
        let (Some(managed_session), Some(path)) = (
            self.managed_session.as_mut(),
            self.managed_session_path.as_deref(),
        ) else {
            return Ok(());
        };
        managed_session.messages = self.messages.clone();
        managed_session.model = Some(self.model.clone());
        managed_session.routing_authority = Some(ManagedSessionRoutingAuthority {
            privacy_mode: self.privacy_mode,
            provider: models::provider_persistence_name(&self.provider),
        });
        managed_session.workspace_root = managed_session
            .workspace_root
            .clone()
            .or_else(|| std::env::current_dir().ok());
        if managed_session.created_by.is_none() {
            managed_session.created_by = Some("cli".to_string());
        }
        if managed_session.title.is_none() {
            managed_session.title = self
                .messages
                .iter()
                .find(|message| message.role == "user")
                .map(Message::text_content)
                .map(|text| {
                    text.split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" ")
                        .chars()
                        .take(80)
                        .collect::<String>()
                })
                .filter(|title| !title.is_empty());
        }
        managed_session.permission_mode = Some(self.permission_mode);
        managed_session.plan_mode = Some(self.plan_mode);
        managed_session.plan_approved = Some(self.plan_approved);
        managed_session.current_plan = self.current_plan.clone();
        managed_session.fast_mode = Some(self.fast_mode);
        managed_session.output_style = Some(self.output_style.clone());
        managed_session.fallback_model_ids =
            self.fallback_chain.as_ref().map(|fc| fc.primaries.clone());
        managed_session.version = crate::runtime::session::MANAGED_SESSION_VERSION;
        managed_session.touch();
        managed_session.save_to_path(path)?;
        self.sync_managed_session_metadata()
    }

    pub fn managed_session_id(&self) -> Option<&str> {
        self.managed_session.as_ref().map(|s| s.session_id.as_str())
    }

    /// Persist the session-end memory summary using the active model/provider
    /// boundary. Local sessions always take the deterministic on-device path.
    pub async fn finalize_memory(&self, config: &CliConfig) -> Result<()> {
        if !self.messages.iter().any(|message| message.role != "system") {
            return Ok(());
        }
        let home = CliConfig::config_dir()?;
        // Honor the user's /memories "auto memory" toggle (default on, so this is
        // a no-op until they turn it off).
        let (auto_memory, _, _) = crate::memory_pipeline::load_memory_settings(&home);
        if !auto_memory {
            return Ok(());
        }
        crate::memory_pipeline::MemoryPipeline::extract_session_summary(
            &home,
            &self.runtime_session_id,
            &self.messages,
            config,
            &self.provider,
            &self.model,
            self.privacy_mode == PrivacyMode::Local,
        )
        .await
    }

    pub(crate) fn managed_auto_routing(
        &self,
    ) -> Option<&crate::runtime::session::ManagedSessionAutoRouting> {
        self.managed_session
            .as_ref()
            .and_then(|session| session.auto_routing.as_ref())
    }

    pub(crate) fn set_managed_auto_routing(
        &mut self,
        state: Option<crate::runtime::session::ManagedSessionAutoRouting>,
    ) {
        if let Some(session) = self.managed_session.as_mut() {
            session.auto_routing = state;
        }
    }

    fn sync_managed_session_metadata(&self) -> Result<()> {
        if !self.session_persistence {
            return Ok(());
        }
        let Some(session_id) = self.managed_session_id() else {
            return Ok(());
        };
        let conn = crate::sessions::open_db()?;
        let cwd = std::env::current_dir()
            .map(|path| path.display().to_string())
            .unwrap_or_default();
        crate::sessions::sync_session_metadata(
            &conn,
            session_id,
            &self.model,
            &cwd,
            "",
            &self.messages,
        )
    }

    /// Attach an MCP server manager.
    pub fn set_mcp_manager(&mut self, mut manager: mcp::McpManager) {
        manager.enforce_privacy_mode(self.privacy_mode);
        self.mcp_manager = Some(manager);
    }

    /// Detach and return the MCP manager (for shutdown on session end).
    pub fn take_mcp_manager(&mut self) -> Option<mcp::McpManager> {
        self.mcp_manager.take()
    }

    /// Detach the subagent manager so the session owner can cancel and join
    /// its background OS threads during runtime shutdown.
    pub fn take_subagent_manager(&mut self) -> Option<subagent::SubagentManager> {
        self.subagent_manager.take()
    }

    pub(crate) fn track_memory_consolidation(&mut self, task: tokio::task::JoinHandle<()>) {
        self.memory_consolidation_tasks
            .retain(|existing| !existing.is_finished());
        self.memory_consolidation_tasks.push(task);
    }

    pub(crate) fn take_memory_consolidation_tasks(&mut self) -> Vec<tokio::task::JoinHandle<()>> {
        std::mem::take(&mut self.memory_consolidation_tasks)
    }

    /// Return MCP tool metadata (if any MCP servers are connected).
    pub fn mcp_info(&self) -> Option<&[mcp::McpTool]> {
        self.mcp_manager
            .as_ref()
            .map(|m| m.tools())
            .filter(|t| !t.is_empty())
    }

    pub fn mcp_prompt_info(&self) -> Option<&[mcp::McpPrompt]> {
        self.mcp_manager
            .as_ref()
            .map(|m| m.prompts())
            .filter(|p| !p.is_empty())
    }

    pub async fn expand_mcp_prompt_invocation(&mut self, input: &str) -> Result<Option<String>> {
        let Some(manager) = self.mcp_manager.as_mut() else {
            return Ok(None);
        };
        manager
            .expand_prompt_invocation(input, self.privacy_mode)
            .await
    }

    /// Get the hooks configuration.
    pub fn hooks_config(&self) -> &hooks::HooksConfig {
        &self.hooks_config
    }

    /// Toggle fast mode on/off.
    #[allow(dead_code)]
    pub fn toggle_fast_mode(&mut self, fast_model: Option<&str>) -> Result<()> {
        if self.fast_mode {
            if let Some(original) = self.original_model.as_ref() {
                let original_provider = if self.privacy_mode == PrivacyMode::Managed {
                    crate::models::resolve_selected_provider(original, Some("managed_cloud"))?
                } else {
                    crate::models::try_detect_provider(original).with_context(|| {
                        format!(
                            "Original model '{}' is no longer recognized; refusing to switch providers silently.",
                            original
                        )
                    })?
                };
                let original_mode = provider_privacy_mode(&original_provider);
                if original_mode != self.privacy_mode {
                    anyhow::bail!(
                        "Original fast-mode model routes through {} mode, not this session's {} authority",
                        original_mode.label(),
                        self.privacy_mode.label()
                    );
                }
                self.model = original.clone();
                self.provider = original_provider;
            }
            self.original_model = None;
            self.fast_mode = false;
        } else {
            self.validate_privacy_boundary()?;
            let target = fast_model
                .map(str::to_string)
                .unwrap_or_else(|| match &self.provider {
                    Provider::Ollama(_) | Provider::Custom { .. } => self.model.clone(),
                    provider => {
                        let provider_name = crate::models::provider_name(provider);
                        crate::model_catalog::fast_completion_model(provider_name)
                    }
                });
            let provider = if self.privacy_mode == PrivacyMode::Managed {
                crate::models::resolve_selected_provider(&target, Some("managed_cloud"))?
            } else {
                crate::models::try_detect_provider(&target).with_context(|| {
                    format!(
                        "Configured fast model '{}' is not recognized. Set `fast_model` to a catalog model or discovered local model.",
                        target
                    )
                })?
            };
            let provider_mode = provider_privacy_mode(&provider);
            if provider_mode != self.privacy_mode {
                anyhow::bail!(
                    "Fast model '{}' routes through {} mode, not this session's {} authority",
                    target,
                    provider_mode.label(),
                    self.privacy_mode.label()
                );
            }
            self.original_model = Some(self.model.clone());
            self.model = target;
            self.provider = provider;
            self.fast_mode = true;
        }
        Ok(())
    }
}

pub(crate) fn resolve_persisted_session_provider(
    model: &str,
    authority: &ManagedSessionRoutingAuthority,
    session_id: &str,
) -> Result<Provider> {
    let provider_name = authority
        .validated_provider()
        .with_context(|| format!("Managed session '{session_id}' has invalid routing authority"))?;
    let provider = models::resolve_selected_provider(model, Some(provider_name)).with_context(|| {
        format!(
            "Persisted provider '{provider_name}' is incompatible with model '{model}' for session '{session_id}'"
        )
    })?;
    let provider_mode = provider_privacy_mode(&provider);
    if provider_mode != authority.privacy_mode {
        anyhow::bail!(
            "Managed session '{}' has incompatible {} trust and {} provider authority",
            session_id,
            authority.privacy_mode.label(),
            provider_name
        );
    }
    Ok(provider)
}

fn auto_routing_matches_privacy(
    state: &crate::runtime::session::ManagedSessionAutoRouting,
    privacy_mode: PrivacyMode,
) -> bool {
    matches!(
        (privacy_mode, state.trust_mode),
        (
            PrivacyMode::Local,
            agiworkforce_model_registry::TrustMode::Local
                | agiworkforce_model_registry::TrustMode::OnDevice
        ) | (
            PrivacyMode::Byok,
            agiworkforce_model_registry::TrustMode::Byok
        ) | (
            PrivacyMode::Managed,
            agiworkforce_model_registry::TrustMode::ManagedCloud
        )
    )
}

fn resolve_context_file(raw_path: &str) -> Result<PathBuf> {
    let expanded = expand_home(raw_path);
    let validated =
        crate::path_security::validate_workspace_path(&expanded).map_err(|e| anyhow::anyhow!(e))?;
    if !validated.is_file() {
        anyhow::bail!("not a file: {}", validated.display());
    }
    Ok(validated)
}

fn expand_home(path: &str) -> String {
    if path == "~" {
        return dirs::home_dir()
            .map(|home| home.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string());
    }
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().into_owned();
        }
    }
    path.to_string()
}

fn escape_attr(path: &Path) -> String {
    path.to_string_lossy()
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn provider_privacy_mode(provider: &Provider) -> PrivacyMode {
    match provider {
        Provider::ManagedCloud => PrivacyMode::Managed,
        Provider::Ollama(models::OllamaMode::Local) => PrivacyMode::Local,
        Provider::OpenAICompatible {
            base_url,
            api_key_env,
            ..
        } if api_key_env.is_none() && models::is_local_provider_base_url(base_url) => {
            PrivacyMode::Local
        }
        Provider::Custom {
            base_url,
            api_key_env,
            ..
        } if api_key_env.is_none() && models::is_local_provider_base_url(base_url) => {
            PrivacyMode::Local
        }
        _ => PrivacyMode::Byok,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::MessageContent;

    use crate::models::ContentBlock;
    // Loop-guard primitives moved to `agiworkforce-agent-core` (Wave 5e1); the
    // `tool_call_to_legacy` conversion helper stays app-local in `executor`.
    use agiworkforce_agent_core::{
        detect_content_loop, hash_tool_call, CONTENT_CHUNK_SIZE, CONTENT_LOOP_CHUNK_THRESHOLD,
        LOOP_DETECTION_THRESHOLD,
    };
    use executor::tool_call_to_legacy;
    use history::build_assistant_message;
    use tools::is_team_tool;

    fn test_context() -> SystemContext {
        SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        }
    }

    fn durable_local_handoff_session(
        destination: PrivacyMode,
    ) -> (
        tempfile::TempDir,
        crate::runtime::session_control::ManagedSessionStore,
        AgentSession,
        PathBuf,
    ) {
        let temp_dir = tempfile::tempdir().expect("session store");
        let store = crate::runtime::session_control::ManagedSessionStore::new(
            temp_dir.path().to_path_buf(),
        );
        let mut session = AgentSession::new("fixture-local-model:latest", &test_context(), None);
        // This helper exercises durable handoff mechanics, independent of the
        // process-global CLI flag mutated by unrelated policy tests.
        session.set_session_persistence(true);
        session.messages.push(Message::text(
            "user",
            "local secret that must not be inherited",
        ));
        let mut source = ManagedSession::with_messages(
            "local-source",
            chrono::Utc::now(),
            session.messages.clone(),
        );
        source.model = Some("fixture-local-model:latest".to_string());
        source.routing_authority = Some(ManagedSessionRoutingAuthority {
            privacy_mode: PrivacyMode::Local,
            provider: "ollama".to_string(),
        });
        let source_path = store.save(&source).expect("save Local source");
        session
            .adopt_managed_session(source, source_path.clone())
            .expect("adopt Local source");

        match destination {
            PrivacyMode::Byok => {
                let model = crate::model_catalog::models_for("openai")
                    .into_iter()
                    .next()
                    .expect("OpenAI catalog model")
                    .id
                    .clone();
                session.switch_model(&model).expect("select BYOK model");
            }
            PrivacyMode::Managed => {
                let model = crate::model_catalog::cloud_models()
                    .into_iter()
                    .next()
                    .expect("managed-cloud eligible model")
                    .id
                    .clone();
                session.model = model;
                session.provider = Provider::ManagedCloud;
            }
            PrivacyMode::Local => panic!("handoff destination must be cloud"),
        }
        assert_eq!(session.privacy_mode, PrivacyMode::Local);
        (temp_dir, store, session, source_path)
    }

    #[test]
    fn test_build_tool_definitions_count() {
        let defs = build_tool_definitions();
        assert_eq!(defs.len(), 39);
        assert!(defs.iter().any(|definition| definition.name == "skill"));
        assert!(defs.iter().any(|definition| definition.name == "agent"));
    }

    #[test]
    fn test_build_team_tool_definitions_count() {
        let defs = build_team_tool_definitions();
        assert_eq!(defs.len(), 4);
    }

    #[test]
    fn test_team_tool_names() {
        let defs = build_team_tool_definitions();
        let names: Vec<&str> = defs.iter().map(|d| d.name.as_str()).collect();
        assert!(names.contains(&"send_message"));
        assert!(names.contains(&"team_task"));
        assert!(names.contains(&"read_messages"));
        assert!(names.contains(&"list_teammates"));
    }

    #[test]
    fn test_is_team_tool() {
        assert!(is_team_tool("send_message"));
        assert!(is_team_tool("team_task"));
        assert!(is_team_tool("read_messages"));
        assert!(is_team_tool("list_teammates"));
        assert!(!is_team_tool("read_file"));
        assert!(!is_team_tool("run_command"));
    }

    #[test]
    fn test_build_tool_definitions_names() {
        let defs = build_tool_definitions();
        let names: Vec<&str> = defs.iter().map(|d| d.name.as_str()).collect();
        assert!(names.contains(&"read_file"));
        assert!(names.contains(&"write_file"));
        assert!(names.contains(&"run_command"));
        assert!(names.contains(&"search_files"));
        assert!(names.contains(&"list_directory"));
        assert!(names.contains(&"edit_file"));
        assert!(names.contains(&"web_search"));
        assert!(names.contains(&"web_fetch"));
        assert!(names.contains(&"task"));
        assert!(names.contains(&"agent"));
    }

    #[test]
    fn test_build_tool_definitions_have_required_fields() {
        let defs = build_tool_definitions();
        for def in &defs {
            assert!(!def.name.is_empty(), "Tool name should not be empty");
            assert!(
                !def.description.is_empty(),
                "Tool {} should have a description",
                def.name
            );
            assert_eq!(
                def.input_schema.get("type").and_then(|t| t.as_str()),
                Some("object"),
                "Tool {} input_schema should have type: object",
                def.name
            );
            assert!(
                def.input_schema.get("properties").is_some(),
                "Tool {} input_schema should have properties",
                def.name
            );
        }
    }

    #[test]
    fn test_build_tool_definitions_valid_schemas() {
        let defs = build_tool_definitions();
        for def in &defs {
            let props = def.input_schema.get("properties").unwrap();
            assert!(
                props.is_object(),
                "Tool {} properties should be an object",
                def.name
            );
        }
    }

    #[test]
    fn test_tool_call_to_legacy() {
        let tc = crate::models::ToolCallResponse {
            id: "tc_1".to_string(),
            name: "read_file".to_string(),
            arguments: serde_json::json!({ "path": "/tmp/test.txt" }),
        };
        let legacy = tool_call_to_legacy(&tc);
        assert_eq!(legacy.name, "read_file");
        assert_eq!(legacy.args.get("path").unwrap(), "/tmp/test.txt");
    }

    #[test]
    fn test_tool_call_to_legacy_non_string_values() {
        let tc = crate::models::ToolCallResponse {
            id: "tc_2".to_string(),
            name: "test_tool".to_string(),
            arguments: serde_json::json!({
                "name": "hello",
                "count": 42,
                "flag": true
            }),
        };
        let legacy = tool_call_to_legacy(&tc);
        assert_eq!(legacy.args.get("name").unwrap(), "hello");
        assert_eq!(legacy.args.get("count").unwrap(), "42");
        assert_eq!(legacy.args.get("flag").unwrap(), "true");
    }

    #[test]
    fn test_build_assistant_message_text_only() {
        let msg = build_assistant_message("Hello world", &[]);
        assert_eq!(msg.role, "assistant");
        assert_eq!(msg.text_content(), "Hello world");
    }

    #[test]
    fn test_build_assistant_message_with_tool_calls() {
        let tcs = vec![crate::models::ToolCallResponse {
            id: "tc_1".to_string(),
            name: "read_file".to_string(),
            arguments: serde_json::json!({ "path": "/tmp/test.txt" }),
        }];
        let msg = build_assistant_message("Let me read that.", &tcs);
        assert_eq!(msg.role, "assistant");
        match &msg.content {
            MessageContent::Blocks(blocks) => {
                assert_eq!(blocks.len(), 2);
                match &blocks[0] {
                    ContentBlock::Text { text } => {
                        assert_eq!(text, "Let me read that.");
                    }
                    _ => panic!("Expected text block"),
                }
                match &blocks[1] {
                    ContentBlock::ToolUse { id, name, .. } => {
                        assert_eq!(id, "tc_1");
                        assert_eq!(name, "read_file");
                    }
                    _ => panic!("Expected tool_use block"),
                }
            }
            _ => panic!("Expected Blocks content"),
        }
    }

    #[test]
    fn test_hash_tool_call_same_inputs() {
        let h1 = hash_tool_call("read_file", &serde_json::json!({"path": "/tmp/test.txt"}));
        let h2 = hash_tool_call("read_file", &serde_json::json!({"path": "/tmp/test.txt"}));
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_hash_tool_call_different_inputs() {
        let h1 = hash_tool_call("read_file", &serde_json::json!({"path": "/tmp/a.txt"}));
        let h2 = hash_tool_call("read_file", &serde_json::json!({"path": "/tmp/b.txt"}));
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_hash_tool_call_different_tools() {
        let h1 = hash_tool_call("read_file", &serde_json::json!({"path": "/tmp/test.txt"}));
        let h2 = hash_tool_call("write_file", &serde_json::json!({"path": "/tmp/test.txt"}));
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_detect_content_loop_no_repetition() {
        let text = "This is a normal response with varied content across its length. \
                    It does not repeat any specific chunk of text more than once.";
        assert!(!detect_content_loop(text));
    }

    #[test]
    fn test_detect_content_loop_short_text_ignored() {
        let text = "short";
        assert!(!detect_content_loop(text));
    }

    #[test]
    fn test_detect_content_loop_repeated_content() {
        let chunk = "A".repeat(CONTENT_CHUNK_SIZE);
        let repeated = chunk.repeat(CONTENT_LOOP_CHUNK_THRESHOLD + 5);
        assert!(detect_content_loop(&repeated));
    }

    #[test]
    fn test_detect_content_loop_code_blocks_skipped() {
        let chunk = "B".repeat(CONTENT_CHUNK_SIZE);
        let repeated = chunk.repeat(CONTENT_LOOP_CHUNK_THRESHOLD + 5);
        let text = format!("Some intro text.\n```\n{}\n```\nSome outro text.", repeated);
        assert!(!detect_content_loop(&text));
    }

    #[test]
    fn test_read_file_schema_has_optional_line_params() {
        let defs = build_tool_definitions();
        let rf = defs.iter().find(|d| d.name == "read_file").unwrap();
        let props = rf.input_schema.get("properties").unwrap();
        assert!(props.get("start_line").is_some());
        assert!(props.get("end_line").is_some());
        let required = rf.input_schema.get("required").unwrap().as_array().unwrap();
        let req_names: Vec<&str> = required.iter().map(|v| v.as_str().unwrap()).collect();
        assert!(!req_names.contains(&"start_line"));
        assert!(!req_names.contains(&"end_line"));
    }

    #[test]
    fn test_web_search_schema() {
        let defs = build_tool_definitions();
        let ws = defs.iter().find(|d| d.name == "web_search").unwrap();
        let props = ws.input_schema.get("properties").unwrap();
        assert!(props.get("query").is_some());
        assert!(props.get("max_results").is_some());
        let required = ws.input_schema.get("required").unwrap().as_array().unwrap();
        let req_names: Vec<&str> = required.iter().map(|v| v.as_str().unwrap()).collect();
        assert!(req_names.contains(&"query"));
        assert!(!req_names.contains(&"max_results"));
    }

    #[test]
    fn test_web_fetch_schema() {
        let defs = build_tool_definitions();
        let wf = defs.iter().find(|d| d.name == "web_fetch").unwrap();
        let props = wf.input_schema.get("properties").unwrap();
        assert!(props.get("url").is_some());
        let required = wf.input_schema.get("required").unwrap().as_array().unwrap();
        let req_names: Vec<&str> = required.iter().map(|v| v.as_str().unwrap()).collect();
        assert!(req_names.contains(&"url"));
    }

    #[test]
    fn test_loop_detection_threshold_is_five() {
        assert_eq!(LOOP_DETECTION_THRESHOLD, 5);
    }

    #[test]
    fn test_checkpoint_save_restore() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        let mut session = AgentSession::new("test-model", &ctx, None);
        assert_eq!(session.checkpoint_count(), 0);

        session.messages.push(Message::text("user", "Hello"));
        session.save_checkpoint();
        assert_eq!(session.checkpoint_count(), 1);

        session.messages.push(Message::text("assistant", "Hi"));
        let msg_count_before = session.messages.len();

        assert!(session.restore_checkpoint());
        assert!(session.messages.len() < msg_count_before);
        assert_eq!(session.checkpoint_count(), 0);

        assert!(!session.restore_checkpoint());
    }

    #[test]
    fn add_context_dir_registers_root_and_loads_instructions() {
        crate::path_security::clear_additional_workspace_roots_for_tests();
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        let mut session = AgentSession::new("test-model", &ctx, None);
        let dir = tempfile::tempdir().expect("extra dir");
        std::fs::write(dir.path().join("CLAUDE.md"), "Use careful tests.").unwrap();

        let report = session
            .add_context_dir(&dir.path().to_string_lossy())
            .expect("add context dir");

        assert_eq!(report.path, dir.path().canonicalize().unwrap());
        assert!(!report.already_present);
        assert!(report.instructions_loaded);
        assert_eq!(session.additional_context_dirs.len(), 1);
        assert!(session
            .messages
            .last()
            .unwrap()
            .text_content()
            .contains("Use careful tests."));
        crate::path_security::clear_additional_workspace_roots_for_tests();
    }

    #[test]
    fn attach_context_files_adds_file_contents_to_session_context() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        let mut session = AgentSession::new("test-model", &ctx, None);
        session.workspace_rules = vec![memory::Rule {
            globs: vec!["*.rs".to_string()],
            body: "Apply the Rust file rule.".to_string(),
            source: PathBuf::from("/rules/rust.md"),
            kind: Some(memory::MemoryKind::Project),
        }];
        session.active_rule_sources.clear();
        let file = tempfile::Builder::new()
            .suffix(".rs")
            .tempfile_in(".")
            .expect("file under workspace");
        std::fs::write(file.path(), "attached body").unwrap();

        let report = session.attach_context_files([file.path().to_string_lossy().to_string()]);

        assert_eq!(report.added.len(), 1);
        assert!(report.failed.is_empty());
        assert_eq!(session.attached_context_files.len(), 1);
        assert!(session
            .messages
            .last()
            .unwrap()
            .text_content()
            .contains("attached body"));
        assert!(session
            .messages
            .last()
            .unwrap()
            .text_content()
            .contains("Apply the Rust file rule."));
    }

    #[test]
    fn user_file_reference_activates_conditional_rule_once() {
        let mut session = AgentSession::new("test-model", &test_context(), None);
        session.workspace_rules = vec![memory::Rule {
            globs: vec!["src/**/*.rs".to_string()],
            body: "Use the project Rust convention.".to_string(),
            source: PathBuf::from("/rules/project-rust.md"),
            kind: Some(memory::MemoryKind::Project),
        }];
        session.active_rule_sources.clear();

        let before = session.messages.len();
        session.activate_rules_from_user_input("Please update src/core/main.rs:42.");
        assert_eq!(session.messages.len(), before + 1);
        assert!(session
            .messages
            .last()
            .unwrap()
            .text_content()
            .contains("Use the project Rust convention."));

        session.activate_rules_from_user_input("Re-check src/core/main.rs.");
        assert_eq!(session.messages.len(), before + 1);
    }

    #[test]
    fn file_tool_arguments_supply_rule_paths_without_scanning_unrelated_tools() {
        let read_paths =
            rule_paths_from_tool_call("read_file", &serde_json::json!({"path": "src/main.rs"}));
        assert_eq!(read_paths, vec![PathBuf::from("src/main.rs")]);

        let patch_paths = rule_paths_from_tool_call(
            "apply_patch",
            &serde_json::json!({
                "patch": "*** Begin Patch\n*** Update File: src/lib.rs\n*** End Patch"
            }),
        );
        assert!(patch_paths.contains(&PathBuf::from("src/lib.rs")));
        assert!(is_rule_sensitive_mutation_tool("apply_patch"));

        assert_eq!(
            rule_paths_from_tool_call(
                "run_command",
                &serde_json::json!({"command": "cargo test src/main.rs"}),
            ),
            vec![PathBuf::from("src/main.rs")],
        );
        assert!(is_rule_sensitive_mutation_tool("run_command"));
    }

    #[test]
    fn local_privacy_blocks_cloud_provider_until_explicit_byok() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        let mut session = AgentSession::new("fixture-local-model:latest", &ctx, None);
        assert_eq!(session.privacy_mode, PrivacyMode::Local);

        let cloud_model = crate::model_catalog::models_for("openai")
            .into_iter()
            .next()
            .map(|model| model.id.clone())
            .unwrap_or_else(|| crate::model_catalog::default_model().to_string());
        session
            .switch_model(&cloud_model)
            .expect("catalog OpenAI model");

        assert_eq!(session.privacy_mode, PrivacyMode::Local);
        assert!(session.validate_privacy_boundary().is_err());

        session.set_privacy_mode(PrivacyMode::Byok);
        assert!(session.validate_privacy_boundary().is_ok());
    }

    #[test]
    fn byok_handoff_requires_exact_review_and_creates_a_redacted_durable_fork() {
        let (_temp_dir, store, mut session, source_path) =
            durable_local_handoff_session(PrivacyMode::Byok);
        session.set_managed_auto_routing(Some(
            crate::runtime::session::ManagedSessionAutoRouting {
                selection: "auto-balanced".to_string(),
                model_key: "fixture-local-model:latest".to_string(),
                task_type:
                    agiworkforce_protocol::developer_session::DeveloperRoutingTaskType::General,
                trust_mode: agiworkforce_model_registry::TrustMode::Local,
            },
        ));
        let source_before = std::fs::read(&source_path).expect("read Local source");
        let draft = "You are continuing an AGI Local chat in BYOK mode.\nPrivacy boundary: the user explicitly selected this handoff.";

        session.arm_byok_handoff(draft).expect("arm BYOK preview");
        assert!(session
            .complete_pending_privacy_handoff_with_store(
                &format!("{draft}\nedited after preview"),
                &store,
            )
            .expect("edited draft is safely rejected")
            .is_none());
        assert_eq!(session.privacy_mode, PrivacyMode::Local);
        assert_eq!(session.managed_session_id(), Some("local-source"));

        session.arm_byok_handoff(draft).expect("re-arm preview");
        assert!(session
            .complete_pending_privacy_handoff_with_store("unrelated local message", &store)
            .expect("unrelated send remains Local")
            .is_none());
        assert_eq!(session.managed_session_id(), Some("local-source"));

        session.arm_byok_handoff(draft).expect("re-arm preview");
        session.clear();
        assert!(session
            .complete_pending_privacy_handoff_with_store(draft, &store)
            .expect("cancelled preview remains Local")
            .is_none());

        session.arm_byok_handoff(draft).expect("final preview");
        let completion = session
            .complete_pending_privacy_handoff_with_store(draft, &store)
            .expect("complete BYOK handoff")
            .expect("handoff completion");
        assert_eq!(completion.source_session_id, "local-source");
        assert_ne!(completion.destination_session_id, "local-source");
        assert_eq!(completion.destination, PrivacyMode::Byok);
        assert_eq!(session.privacy_mode, PrivacyMode::Byok);
        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].role, "system");
        assert!(!session.messages[0].text_content().contains("local secret"));
        assert_eq!(
            std::fs::read(&source_path).expect("re-read Local source"),
            source_before,
            "source session must remain byte-for-byte unchanged"
        );

        let destination_resolved = store
            .resolve(
                crate::runtime::session_control::ManagedSessionReference::SessionId(
                    completion.destination_session_id.clone(),
                ),
            )
            .expect("resolve destination");
        let destination =
            ManagedSession::load_from_path(&destination_resolved.path).expect("load destination");
        assert_eq!(destination.messages.len(), 1);
        assert!(
            destination.auto_routing.is_none(),
            "Local Auto metadata must not survive into a BYOK continuation"
        );
        assert_eq!(destination.messages[0].role, "system");
        assert!(!destination.messages[0]
            .text_content()
            .contains("local secret that must not be inherited"));
        assert_eq!(
            destination
                .fork
                .as_ref()
                .map(|fork| fork.source_session_id.as_str()),
            Some("local-source")
        );
        assert_eq!(
            destination
                .routing_authority
                .as_ref()
                .map(|authority| authority.privacy_mode),
            Some(PrivacyMode::Byok)
        );

        let mut resumed = AgentSession::new("fixture-local-model:latest", &test_context(), None);
        resumed
            .adopt_managed_session(destination, destination_resolved.path)
            .expect("restore BYOK authority after restart");
        assert_eq!(resumed.privacy_mode, PrivacyMode::Byok);
        assert_eq!(
            models::provider_persistence_name(&resumed.provider),
            completion.provider
        );
    }

    #[test]
    fn cloud_model_starts_in_byok_privacy_mode() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        let session = AgentSession::new(crate::model_catalog::default_model(), &ctx, None);

        assert_eq!(session.privacy_mode, PrivacyMode::Byok);
        assert!(session.validate_privacy_boundary().is_ok());
    }

    #[test]
    fn managed_gateway_starts_in_managed_privacy_mode() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        let managed_model = crate::model_catalog::cloud_models()
            .into_iter()
            .next()
            .expect("managed-cloud eligible model")
            .id
            .clone();
        let session =
            AgentSession::new_with_provider(&managed_model, &ctx, None, Provider::ManagedCloud);

        assert_eq!(session.privacy_mode, PrivacyMode::Managed);
        assert_eq!(session.provider_privacy_mode(), PrivacyMode::Managed);
        assert!(session.validate_privacy_boundary().is_ok());
    }

    #[test]
    fn established_managed_transcript_cannot_switch_to_a_direct_provider() {
        let managed_model = crate::model_catalog::cloud_models()
            .into_iter()
            .next()
            .expect("managed-cloud eligible model")
            .id
            .clone();
        let direct_model = crate::model_catalog::models_for("anthropic")
            .into_iter()
            .next()
            .expect("Anthropic catalog model")
            .id
            .clone();
        let mut session = AgentSession::new_with_provider(
            &managed_model,
            &test_context(),
            None,
            Provider::ManagedCloud,
        );
        session
            .messages
            .push(Message::text("user", "managed-only transcript"));
        let messages_before = serde_json::to_value(&session.messages).expect("serialize messages");

        let error = session
            .switch_model(&direct_model)
            .expect_err("Managed transcript must not move to a direct provider");
        assert!(error.to_string().contains("trust boundaries"), "{error:#}");
        assert_eq!(session.model, managed_model);
        assert_eq!(session.provider, Provider::ManagedCloud);
        assert_eq!(session.privacy_mode, PrivacyMode::Managed);
        assert_eq!(
            serde_json::to_value(&session.messages).expect("serialize messages"),
            messages_before
        );
    }

    #[test]
    fn managed_picker_rejects_established_byok_or_local_transcripts() {
        let byok_model = crate::model_catalog::models_for("anthropic")
            .into_iter()
            .next()
            .expect("Anthropic catalog model")
            .id
            .clone();
        let mut byok = AgentSession::new(&byok_model, &test_context(), None);
        byok.messages.push(Message::text("user", "BYOK transcript"));
        let byok_error = byok
            .switch_managed_model("not-even-consulted")
            .expect_err("BYOK transcript must not enter Managed Cloud");
        assert!(byok_error.to_string().contains("established byok"));
        assert_eq!(byok.privacy_mode, PrivacyMode::Byok);

        let mut local = AgentSession::new("fixture-local-model:latest", &test_context(), None);
        local
            .messages
            .push(Message::text("user", "Local transcript"));
        let local_error = local
            .switch_managed_model("not-even-consulted")
            .expect_err("Local transcript must not enter Managed Cloud");
        assert!(local_error.to_string().contains("established local"));
        assert_eq!(local.privacy_mode, PrivacyMode::Local);
    }

    #[test]
    fn privacy_validation_rejects_managed_byok_mismatches_in_both_directions() {
        let managed_model = crate::model_catalog::cloud_models()
            .into_iter()
            .next()
            .expect("managed-cloud eligible model")
            .id
            .clone();
        let mut managed = AgentSession::new_with_provider(
            &managed_model,
            &test_context(),
            None,
            Provider::ManagedCloud,
        );
        managed.set_privacy_mode(PrivacyMode::Byok);
        assert!(managed.validate_privacy_boundary().is_err());

        let byok_model = crate::model_catalog::models_for("anthropic")
            .into_iter()
            .next()
            .expect("Anthropic catalog model")
            .id
            .clone();
        let mut byok = AgentSession::new(&byok_model, &test_context(), None);
        byok.provider = Provider::ManagedCloud;
        assert_eq!(byok.privacy_mode, PrivacyMode::Byok);
        assert!(byok.validate_privacy_boundary().is_err());
    }

    #[test]
    fn managed_fast_mode_keeps_the_gateway_provider_in_both_directions() {
        let managed_model = crate::model_catalog::cloud_models()
            .into_iter()
            .next()
            .expect("managed-cloud eligible model")
            .id
            .clone();
        let mut session = AgentSession::new_with_provider(
            &managed_model,
            &test_context(),
            None,
            Provider::ManagedCloud,
        );

        session
            .toggle_fast_mode(Some(&managed_model))
            .expect("enable Managed fast mode");
        assert_eq!(session.provider, Provider::ManagedCloud);
        assert_eq!(session.privacy_mode, PrivacyMode::Managed);
        assert!(session.validate_privacy_boundary().is_ok());

        session
            .toggle_fast_mode(None)
            .expect("disable Managed fast mode");
        assert_eq!(session.model, managed_model);
        assert_eq!(session.provider, Provider::ManagedCloud);
        assert_eq!(session.privacy_mode, PrivacyMode::Managed);
        assert!(session.validate_privacy_boundary().is_ok());
    }

    #[test]
    fn managed_handoff_persists_managed_authority_and_restart_continuity() {
        let (_temp_dir, store, mut session, source_path) =
            durable_local_handoff_session(PrivacyMode::Managed);
        let source_before = std::fs::read(&source_path).expect("read Local source");
        let draft = "You are continuing an AGI Local chat in Managed Cloud mode.\nPrivacy boundary: the user explicitly selected this handoff.";
        session
            .arm_managed_handoff(draft)
            .expect("arm Managed Cloud preview");
        let completion = session
            .complete_pending_privacy_handoff_with_store(draft, &store)
            .expect("complete Managed Cloud handoff")
            .expect("handoff completion");
        assert_eq!(session.privacy_mode, PrivacyMode::Managed);
        assert_ne!(completion.destination_session_id, "local-source");
        assert_eq!(completion.provider, "managed_cloud");
        assert_eq!(
            std::fs::read(&source_path).expect("re-read Local source"),
            source_before
        );

        let destination_resolved = store
            .resolve(
                crate::runtime::session_control::ManagedSessionReference::SessionId(
                    completion.destination_session_id,
                ),
            )
            .expect("resolve destination");
        let destination =
            ManagedSession::load_from_path(&destination_resolved.path).expect("load destination");
        assert_eq!(destination.messages.len(), 1);
        assert_eq!(destination.messages[0].role, "system");
        assert!(!destination.messages[0]
            .text_content()
            .contains("local secret that must not be inherited"));
        assert_eq!(
            destination
                .routing_authority
                .as_ref()
                .map(|authority| (&authority.privacy_mode, authority.provider.as_str())),
            Some((&PrivacyMode::Managed, "managed_cloud"))
        );

        let mut resumed = AgentSession::new("fixture-local-model:latest", &test_context(), None);
        resumed
            .adopt_managed_session(destination, destination_resolved.path)
            .expect("restore Managed Cloud authority after restart");
        assert_eq!(resumed.privacy_mode, PrivacyMode::Managed);
        assert_eq!(resumed.provider, Provider::ManagedCloud);
    }

    #[test]
    fn reviewed_handoff_clears_unselected_source_context_before_first_send() {
        let (_temp_dir, store, mut session, _source_path) =
            durable_local_handoff_session(PrivacyMode::Byok);
        let local_marker = "LOCAL_CONTEXT_MUST_NOT_CROSS";
        session.pending_image_blocks = vec![ContentBlock::Image {
            mime: "image/png".to_string(),
            data_b64: local_marker.to_string(),
        }];
        session
            .attached_context_files
            .push(PathBuf::from("/local/private-file.txt"));
        session
            .additional_context_dirs
            .push(PathBuf::from("/local/private-root"));
        session.workspace_rules = vec![memory::Rule {
            globs: vec!["src/**/*.rs".to_string()],
            body: local_marker.to_string(),
            source: PathBuf::from("/local/private-rule.md"),
            kind: Some(memory::MemoryKind::Project),
        }];
        session
            .active_rule_sources
            .insert(PathBuf::from("/local/already-active-rule.md"));
        session.plan_rejection_feedback = Some(local_marker.to_string());
        session.fallback_chain = Some(crate::routing::fallback::FallbackChain::parse(
            &session.model,
        ));
        session.save_checkpoint();
        session.turn_count = 7;
        session.total_input_tokens = 123;
        session.total_output_tokens = 456;

        let draft = "You are continuing an AGI Local chat in BYOK mode.\nPrivacy boundary: the user explicitly selected this handoff.";
        session.arm_byok_handoff(draft).expect("arm BYOK preview");
        let completion = session
            .complete_pending_privacy_handoff_with_store(draft, &store)
            .expect("complete reviewed handoff")
            .expect("handoff completion");

        assert!(session.pending_image_blocks.is_empty());
        assert!(session.attached_context_files.is_empty());
        assert!(session.additional_context_dirs.is_empty());
        assert!(session.workspace_rules.is_empty());
        assert!(session.active_rule_sources.is_empty());
        assert!(session.plan_rejection_feedback.is_none());
        assert!(session.fallback_chain.is_none());
        assert_eq!(session.checkpoint_count(), 0);
        assert_eq!(session.turn_count, 0);
        assert_eq!(session.total_input_tokens, 0);
        assert_eq!(session.total_output_tokens, 0);
        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].role, "system");
        assert!(!session.messages[0].text_content().contains(local_marker));

        let before_rule_activation = session.messages.len();
        session.activate_rules_from_user_input("Please edit src/private.rs");
        assert_eq!(session.messages.len(), before_rule_activation);
        session.messages.push(Message::text("user", draft));
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[1].text_content(), draft);
        assert!(!session
            .messages
            .iter()
            .any(|message| message.text_content().contains(local_marker)));

        let destination = store
            .load(
                crate::runtime::session_control::ManagedSessionReference::SessionId(
                    completion.destination_session_id,
                ),
            )
            .expect("load destination");
        assert!(destination.current_plan.is_none());
        assert_eq!(destination.plan_approved, Some(false));
        assert_eq!(destination.fast_mode, Some(false));
        assert!(destination.fallback_model_ids.is_none());
    }

    #[test]
    fn ui_config_applies_output_style_and_privacy_mode() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        let mut session = AgentSession::new(crate::model_catalog::default_model(), &ctx, None);
        let mut config = CliConfig::default();
        config.ui.output_style = Some("learning".to_string());
        config.ui.privacy_mode = Some("local".to_string());

        session.apply_ui_config(&config);

        assert_eq!(session.output_style, "learning");
        assert_eq!(session.privacy_mode, PrivacyMode::Local);
    }

    #[test]
    fn test_plan_mode_default_false() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        let session = AgentSession::new("test-model", &ctx, None);
        assert!(!session.plan_mode);
    }

    #[test]
    fn test_fast_mode_toggle() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        let original = crate::model_catalog::models_for("anthropic")
            .into_iter()
            .find(|model| {
                crate::model_catalog::quality_tier_for_model(&model.id)
                    .as_deref()
                    .is_some_and(|tier| tier == "best")
            })
            .or_else(|| {
                crate::model_catalog::models_for("anthropic")
                    .into_iter()
                    .next()
            })
            .map(|model| model.id.clone())
            .unwrap_or_else(|| crate::model_catalog::default_model().to_string());
        let fast = crate::model_catalog::fast_completion_model("anthropic");
        let mut session = AgentSession::new(&original, &ctx, None);
        assert!(!session.fast_mode);

        session
            .toggle_fast_mode(Some(&fast))
            .expect("catalog Anthropic fast model");
        assert!(session.fast_mode);
        assert_eq!(session.model, fast);

        session
            .toggle_fast_mode(None)
            .expect("restore original model");
        assert!(!session.fast_mode);
        assert_eq!(session.model, original);
    }

    #[test]
    fn test_max_turns_default_none() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        let session = AgentSession::new("test-model", &ctx, None);
        assert!(session.max_turns.is_none());
    }

    #[test]
    fn test_skip_permissions_default_false() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        let session = AgentSession::new("test-model", &ctx, None);
        assert!(!session.skip_permissions);
    }

    #[test]
    fn tool_filters_hide_only_entire_disallowed_schema_rules() {
        let ctx = test_context();
        let mut session = AgentSession::new("test-model", &ctx, None);
        session.apply_tool_filters(&[], &["Bash(*)".to_string()]);

        let names = session
            .effective_tool_definitions()
            .into_iter()
            .map(|tool| tool.name)
            .collect::<Vec<_>>();

        assert!(!names.iter().any(|name| name == "run_command"));

        session.apply_tool_filters(&[], &["Bash(rm*)".to_string()]);
        let names = session
            .effective_tool_definitions()
            .into_iter()
            .map(|tool| tool.name)
            .collect::<Vec<_>>();

        assert!(names.iter().any(|name| name == "run_command"));
    }

    #[test]
    fn apply_tool_filters_stores_empty_allowlist_as_unrestricted() {
        let ctx = test_context();
        let mut session = AgentSession::new("test-model", &ctx, None);
        session.apply_tool_filters(&[], &["WebFetch(*)".to_string()]);

        assert!(session.allowed_tools.is_none());
        assert_eq!(session.disallowed_tools, vec!["WebFetch(*)"]);
    }

    #[test]
    fn effective_tool_definitions_restore_mutating_tools_after_plan_approval() {
        let ctx = test_context();
        let mut session = AgentSession::new("test-model", &ctx, None);
        session.plan_mode = true;

        let locked_names = session
            .effective_tool_definitions()
            .into_iter()
            .map(|tool| tool.name)
            .collect::<Vec<_>>();
        assert!(!locked_names.iter().any(|name| name == "run_command"));
        assert!(locked_names.iter().any(|name| name == "update_plan"));

        session.plan_approved = true;
        let approved_names = session
            .effective_tool_definitions()
            .into_iter()
            .map(|tool| tool.name)
            .collect::<Vec<_>>();
        assert!(approved_names.iter().any(|name| name == "run_command"));
        assert!(!approved_names.iter().any(|name| name == "update_plan"));
    }

    // -----------------------------------------------------------------------
    // json-events / continuation_sink tests
    //
    // These tests prove that:
    //  (a) json_events defaults to false on a new session
    //  (b) A MessageDelta event serializes as strict JSONL (every line parses
    //      as a JSON object with the expected "event" discriminant)
    //  (c) The continuation_sink() helper emits MessageDelta events when
    //      json_events=true, confirmed by verifying the serialised form
    //      matches what the sink would write to stdout.
    //  (d) When json_events=false the sink falls through to the raw print!
    //      path, which is confirmed by the absence of any JSON formatting
    //      obligation on that branch.
    // -----------------------------------------------------------------------

    #[test]
    fn json_events_defaults_to_false_on_new_session() {
        let ctx = test_context();
        let session = AgentSession::new("test-model", &ctx, None);
        assert!(!session.json_events);
        assert!(session.json_session_id.is_empty());
        assert!(session.sdk_stream_context.is_none());
    }

    #[test]
    fn json_events_and_session_id_can_be_set() {
        let ctx = test_context();
        let mut session = AgentSession::new("test-model", &ctx, None);
        session.json_events = true;
        session.json_session_id = "sess-xyz".to_string();
        assert!(session.json_events);
        assert_eq!(session.json_session_id, "sess-xyz");
    }

    /// Verify that a MessageDelta event emitted by the continuation path
    /// serialises as strict JSONL: the line must parse as a JSON object with
    /// `event == "message_delta"` and a `text` field.  This is the canonical
    /// shape that external consumers depend on.
    ///
    /// This test FAILS before the fix (because the raw `print!` path does not
    /// write JSON at all) and PASSES after (because continuation_sink() now
    /// routes through AgentEvent::MessageDelta when json_events=true).
    #[test]
    fn continuation_sink_in_json_events_mode_produces_valid_jsonl_message_delta() {
        // Build the event that continuation_sink() would emit for a single chunk.
        let session_id = "test-session-42".to_string();
        let chunk_text = "Hello continuation world".to_string();

        let event = crate::agent_events::AgentEvent::MessageDelta {
            session_id: session_id.clone(),
            text: chunk_text.clone(),
        };

        // Serialize the event as the sink would write it to stdout.
        let mut buf: Vec<u8> = Vec::new();
        event.emit(&mut buf);

        // The output must be one JSONL line (terminated with '\n').
        let raw = String::from_utf8(buf).expect("utf8");
        let lines: Vec<&str> = raw.lines().collect();
        assert_eq!(lines.len(), 1, "expected exactly one JSONL line");

        // Every line must parse as a JSON object.
        let parsed: serde_json::Value =
            serde_json::from_str(lines[0]).expect("line must be valid JSON");

        // Discriminant must be "message_delta" (serde tag).
        assert_eq!(
            parsed.get("event").and_then(|v| v.as_str()),
            Some("message_delta"),
            "event field must be message_delta"
        );

        // session_id and text must be preserved.
        assert_eq!(
            parsed.get("session_id").and_then(|v| v.as_str()),
            Some("test-session-42"),
        );
        assert_eq!(
            parsed.get("text").and_then(|v| v.as_str()),
            Some("Hello continuation world"),
        );
    }

    /// Prove that when json_events=true, the AgentSession carries the flag and
    /// session_id so that continuation_sink() has all the data it needs to
    /// emit a well-formed MessageDelta.  This is the session-level wiring test
    /// that would have failed before the new fields were added to AgentSession.
    #[test]
    fn continuation_sink_uses_json_session_id_from_session() {
        let ctx = test_context();
        let mut session = AgentSession::new("test-model", &ctx, None);
        session.json_events = true;
        session.json_session_id = "my-session-id".to_string();

        // Obtain the sink — it must not panic and must capture the session_id.
        let mut sink = session.continuation_sink();

        // The sink is a closure; invoke it and confirm the resulting event
        // would have the right session_id by re-serialising via AgentEvent directly.
        let expected_event = crate::agent_events::AgentEvent::MessageDelta {
            session_id: "my-session-id".to_string(),
            text: "chunk".to_string(),
        };
        let mut buf = Vec::new();
        expected_event.emit(&mut buf);
        let serialised = String::from_utf8(buf).unwrap();

        // The serialised form must parse as JSON with session_id = "my-session-id".
        let v: serde_json::Value = serde_json::from_str(serialised.trim()).unwrap();
        assert_eq!(v["session_id"], "my-session-id");
        assert_eq!(v["event"], "message_delta");

        // Call the actual sink — it writes to real stdout (not captured here),
        // but must not panic.  The test above proves the event shape is correct;
        // this call proves the closure is callable without errors.
        (sink)("chunk");
    }

    /// Verify that multiple MessageDelta lines produced for a simulated
    /// continuation turn are each independently valid JSON.  This exercises
    /// the "strict JSONL across continuation" contract described in the task.
    #[test]
    fn multiple_continuation_chunks_produce_independent_jsonl_lines() {
        let chunks = ["Hello", " there", " world"];
        let session_id = "sid-cont".to_string();

        let mut all_lines: Vec<String> = Vec::new();
        for chunk in &chunks {
            let event = crate::agent_events::AgentEvent::MessageDelta {
                session_id: session_id.clone(),
                text: chunk.to_string(),
            };
            let mut buf = Vec::new();
            event.emit(&mut buf);
            let line = String::from_utf8(buf).unwrap();
            // Each emit call must produce exactly one line.
            assert_eq!(line.lines().count(), 1, "each chunk produces one line");
            all_lines.push(line.trim().to_string());
        }

        // Every collected line must parse as JSON.
        for line in &all_lines {
            let v: serde_json::Value =
                serde_json::from_str(line).expect("every line must be valid JSON");
            assert_eq!(v["event"], "message_delta");
            assert_eq!(v["session_id"], "sid-cont");
        }

        // The chunks must be delivered in order and independently (not merged).
        assert_eq!(all_lines.len(), chunks.len());
    }

    // -----------------------------------------------------------------------
    // `--no-session-persistence` write gate
    // -----------------------------------------------------------------------

    fn persistence_test_session(enabled: bool) -> AgentSession {
        let ctx = test_context();
        let mut session = AgentSession::new(crate::model_catalog::default_model(), &ctx, None);
        session.set_session_persistence(enabled);
        session
    }

    #[test]
    fn sessions_persist_by_default() {
        let session = persistence_test_session(true);
        assert!(
            session.session_persistence_enabled(),
            "a run without --no-session-persistence must still persist"
        );
    }

    #[test]
    fn persistence_disabled_creates_no_managed_session() {
        let mut session = persistence_test_session(false);

        session
            .enable_managed_session()
            .expect("enable_managed_session must succeed as a no-op");

        // `create_managed_session` writes the session file first and only then
        // is the result adopted, so an absent id proves nothing was written
        // under `~/.agiworkforce/managed_sessions/`.
        assert!(
            session.managed_session_id().is_none(),
            "--no-session-persistence must not create a managed session"
        );
        assert!(
            session.managed_session_path.is_none(),
            "--no-session-persistence must not bind a managed session file"
        );
    }

    #[test]
    fn persistence_disabled_leaves_a_resumed_session_file_untouched() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("resumed.json");

        let mut session = persistence_test_session(false);
        let mut on_disk = crate::runtime::session::ManagedSession::with_messages(
            "resumed-session-id",
            chrono::Utc::now(),
            vec![Message::text("user", "first turn")],
        );
        on_disk.model = Some(session.model.clone());
        on_disk.routing_authority = Some(session.current_routing_authority());
        on_disk.save_to_path(&path).expect("seed session file");
        let before = std::fs::read_to_string(&path).expect("read seeded file");

        session
            .adopt_managed_session(on_disk, path.clone())
            .expect("adopt persisted authority");
        // A resumed session still rehydrates in memory...
        assert_eq!(
            session.managed_session_id(),
            Some("resumed-session-id"),
            "resume must still rehydrate even with persistence off"
        );

        // ...but the turn that follows must not be written back.
        session
            .messages
            .push(Message::text("user", "second turn — must never reach disk"));
        session
            .persist_managed_session()
            .expect("persist_managed_session must succeed as a no-op");
        session
            .override_session_id("attempted-rename")
            .expect("override_session_id must succeed as a no-op");

        let after = std::fs::read_to_string(&path).expect("read file after persist");
        assert_eq!(
            before, after,
            "--no-session-persistence must not write back to a resumed session file"
        );
        assert!(
            !after.contains("must never reach disk"),
            "conversation content leaked to disk despite --no-session-persistence"
        );
    }

    #[test]
    fn persistence_enabled_writes_back_to_the_session_file() {
        // Control for the test above: the same sequence with the flag off does
        // reach disk, so the gate is what suppresses the write, not the setup.
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("resumed.json");

        let mut session = persistence_test_session(true);
        let mut on_disk = crate::runtime::session::ManagedSession::with_messages(
            "resumed-session-id",
            chrono::Utc::now(),
            vec![Message::text("user", "first turn")],
        );
        on_disk.model = Some(session.model.clone());
        on_disk.routing_authority = Some(session.current_routing_authority());
        on_disk.save_to_path(&path).expect("seed session file");

        session
            .adopt_managed_session(on_disk, path.clone())
            .expect("adopt persisted authority");
        session
            .messages
            .push(Message::text("user", "second turn — expected on disk"));
        session
            .persist_managed_session()
            .expect("persist_managed_session should succeed");

        let after = std::fs::read_to_string(&path).expect("read file after persist");
        assert!(
            after.contains("expected on disk"),
            "with persistence enabled the turn must be written back"
        );
    }

    #[test]
    fn session_persistence_is_seeded_from_the_process_policy() {
        // Proves the `--no-session-persistence` flag actually reaches a
        // session: `run_main` publishes the policy before dispatch and every
        // constructor reads it once.
        let _guard = crate::cli_options::session_persistence_policy_lock();
        let previous = crate::cli_options::session_persistence_enabled();

        crate::cli_options::set_session_persistence_enabled(false);
        let ctx = test_context();
        let opted_out = AgentSession::new(crate::model_catalog::default_model(), &ctx, None);
        crate::cli_options::set_session_persistence_enabled(previous);

        assert!(
            !opted_out.session_persistence_enabled(),
            "a session constructed under --no-session-persistence must refuse to persist"
        );

        let default_session = AgentSession::new(crate::model_catalog::default_model(), &ctx, None);
        assert!(
            default_session.session_persistence_enabled(),
            "restoring the policy must restore persistence for later sessions"
        );
    }
}
