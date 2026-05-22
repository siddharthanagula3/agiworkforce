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
use crate::runtime::session::ManagedSession;
use crate::skills;
use crate::subagent;
use crate::teams;

mod chat;
mod executor;
mod history;
mod prompt;
mod tools;

pub use executor::ToolCall;
pub use prompt::assemble_system_prompt;

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
    pub plan_mode: bool,
    pub permission_mode: crate::cli_options::PermissionMode,
    pub plan_approved: bool,
    pub current_plan: Option<crate::plan_mode::Plan>,
    pub current_plan_path: Option<std::path::PathBuf>,
    pub plan_rejection_feedback: Option<String>,
    pub auto_approve_plan: bool,
    pub skip_permissions: bool,
    pub auto_approve_safe: bool,
    pub quiet: bool,
    #[allow(dead_code)]
    pub fast_mode: bool,
    #[allow(dead_code)]
    pub(crate) original_model: Option<String>,
    pub(crate) checkpoints: Vec<Vec<Message>>,
    #[allow(dead_code)]
    pub session_name: Option<String>,
    #[allow(dead_code)]
    pub fallback_model: Option<String>,
    pub allowed_tools: Option<Vec<String>>,
    pub disallowed_tools: Vec<String>,
    pub privacy_mode: PrivacyMode,
    pub additional_context_dirs: Vec<PathBuf>,
    pub attached_context_files: Vec<PathBuf>,
    pub(crate) subagent_manager: Option<subagent::SubagentManager>,
    pub(crate) team_manager: Option<teams::TeamManager>,
    pub(crate) managed_session: Option<ManagedSession>,
    pub(crate) managed_session_path: Option<PathBuf>,
}

/// Metadata returned after a single agent turn.
pub struct TurnResult {
    pub response: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_read_tokens: u32,
    pub cache_creation_tokens: u32,
    pub via_subscription: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrivacyMode {
    Local,
    Byok,
    Managed,
}

impl PrivacyMode {
    pub fn label(self) -> &'static str {
        match self {
            PrivacyMode::Local => "local",
            PrivacyMode::Byok => "byok",
            PrivacyMode::Managed => "managed",
        }
    }

    pub fn description(self) -> &'static str {
        match self {
            PrivacyMode::Local => "no prompt, chat, or file context should leave this device",
            PrivacyMode::Byok => {
                "selected context may be sent directly to the user's configured provider key"
            }
            PrivacyMode::Managed => {
                "selected context may be sent through AGI Workforce managed cloud"
            }
        }
    }

    pub fn from_arg(arg: &str) -> Option<Self> {
        match arg.trim().to_ascii_lowercase().as_str() {
            "local" | "offline" | "device" => Some(PrivacyMode::Local),
            "byok" | "cloud-byok" | "provider" => Some(PrivacyMode::Byok),
            "managed" | "agi" | "agi-cloud" | "cloud" => Some(PrivacyMode::Managed),
            _ => None,
        }
    }
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

impl AgentSession {
    /// Create a new agent session with the system prompt.
    pub fn new(
        model: &str,
        sys_context: &SystemContext,
        custom_system_prompt: Option<&str>,
    ) -> Self {
        let provider = models::detect_provider(model);
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
        let skill_refs: Vec<&skills::Skill> = discovered.iter().collect();
        let skills_content = skills::format_skills_for_prompt(&skill_refs);

        let rules = std::env::current_dir()
            .ok()
            .map(|cwd| memory::load_rules(&cwd))
            .unwrap_or_default();
        let rules_context = if rules.is_empty() {
            String::new()
        } else {
            memory::rules_context_prompt(&rules, &[])
        };

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
            plan_mode: false,
            permission_mode: crate::cli_options::PermissionMode::Default,
            plan_approved: false,
            current_plan: None,
            current_plan_path: None,
            plan_rejection_feedback: None,
            auto_approve_plan: false,
            skip_permissions: false,
            auto_approve_safe: false,
            quiet: false,
            fast_mode: false,
            original_model: None,
            checkpoints: Vec::new(),
            session_name: None,
            fallback_model: None,
            allowed_tools: None,
            disallowed_tools: Vec::new(),
            privacy_mode,
            additional_context_dirs: Vec::new(),
            attached_context_files: Vec::new(),
            subagent_manager: None,
            team_manager: None,
            managed_session: None,
            managed_session_path: None,
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
            .map(|mcp_manager| mcp_manager.tool_definitions());
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
    pub fn switch_model(&mut self, model: &str) {
        let next_provider = models::detect_provider(model);
        self.model = model.to_string();
        self.provider = next_provider;
        self.adopt_provider_privacy_mode();
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
            let message = format!(
                "<attached_files>\n{}\n</attached_files>",
                segments.join("\n\n")
            );
            self.messages.push(Message::text("system", &message));
        }

        report
    }

    /// Override the provider from config.
    pub fn set_provider_override(&mut self, provider_name: &str) {
        if let Some(p) = models::provider_from_name(provider_name) {
            self.provider = p;
            self.adopt_provider_privacy_mode();
        }
    }

    pub fn set_privacy_mode(&mut self, mode: PrivacyMode) {
        self.privacy_mode = mode;
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

    pub fn validate_privacy_boundary(&self) -> Result<()> {
        let provider_mode = self.provider_privacy_mode();
        if self.privacy_mode == PrivacyMode::Local && provider_mode != PrivacyMode::Local {
            anyhow::bail!(
                "Privacy boundary blocked: this session is Local, but model `{}` routes to {:?} ({}) through {} mode. Use `/continue-with-byok` to create a reviewable BYOK handoff draft, or run `/privacy-mode byok` only after you intentionally leave Local mode.",
                self.model,
                self.provider,
                provider_mode.description(),
                provider_mode.label(),
            );
        }
        Ok(())
    }

    fn adopt_provider_privacy_mode(&mut self) {
        let provider_mode = self.provider_privacy_mode();
        if self.privacy_mode != PrivacyMode::Local || provider_mode == PrivacyMode::Local {
            self.privacy_mode = provider_mode;
        }
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

    /// Enable managed session persistence for this session.
    pub fn enable_managed_session(&mut self) -> Result<()> {
        if self.managed_session.is_some() {
            return Ok(());
        }
        let resolved =
            crate::runtime::session_control::create_managed_session(self.messages.clone())?;
        let managed_session = ManagedSession::load_from_path(&resolved.path)?;
        self.adopt_managed_session(managed_session, resolved.path);
        self.sync_managed_session_metadata()?;
        Ok(())
    }

    /// Adopt an existing managed session as the persistence backing.
    pub fn adopt_managed_session(&mut self, managed_session: ManagedSession, path: PathBuf) {
        self.managed_session = Some(managed_session);
        self.managed_session_path = Some(path);
    }

    /// Persist the current in-memory conversation into the managed session file.
    pub fn persist_managed_session(&mut self) -> Result<()> {
        let (Some(managed_session), Some(path)) = (
            self.managed_session.as_mut(),
            self.managed_session_path.as_deref(),
        ) else {
            return Ok(());
        };
        managed_session.messages = self.messages.clone();
        managed_session.touch();
        managed_session.save_to_path(path)?;
        self.sync_managed_session_metadata()
    }

    pub fn managed_session_id(&self) -> Option<&str> {
        self.managed_session.as_ref().map(|s| s.session_id.as_str())
    }

    fn sync_managed_session_metadata(&self) -> Result<()> {
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
    pub fn set_mcp_manager(&mut self, manager: mcp::McpManager) {
        self.mcp_manager = Some(manager);
    }

    /// Detach and return the MCP manager (for shutdown on session end).
    pub fn take_mcp_manager(&mut self) -> Option<mcp::McpManager> {
        self.mcp_manager.take()
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
        manager.expand_prompt_invocation(input).await
    }

    /// Get the hooks configuration.
    pub fn hooks_config(&self) -> &hooks::HooksConfig {
        &self.hooks_config
    }

    /// Toggle fast mode on/off.
    #[allow(dead_code)]
    pub fn toggle_fast_mode(&mut self, fast_model: Option<&str>) {
        if self.fast_mode {
            if let Some(ref original) = self.original_model.take() {
                self.model = original.clone();
                self.provider = crate::models::detect_provider(&self.model);
            }
            self.fast_mode = false;
        } else {
            // Documented fast-mode fallback (rule-models-json exception): used only
            // when the caller provides no explicit fast_model.
            let target = fast_model
                .unwrap_or("claude-haiku-4-5-20251001")
                .to_string();
            self.original_model = Some(self.model.clone());
            self.model = target.clone();
            self.provider = crate::models::detect_provider(&target);
            self.fast_mode = true;
        }
    }
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
        Provider::Ollama(models::OllamaMode::Local) => PrivacyMode::Local,
        Provider::OpenAICompatible {
            base_url,
            api_key_env,
            ..
        } if api_key_env.is_none() && is_local_provider_url(base_url) => PrivacyMode::Local,
        Provider::Custom {
            base_url,
            api_key_env,
            ..
        } if api_key_env.is_none() && is_local_provider_url(base_url) => PrivacyMode::Local,
        _ => PrivacyMode::Byok,
    }
}

fn is_local_provider_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("http://localhost")
        || lower.starts_with("http://127.")
        || lower.starts_with("http://[::1]")
        || lower.starts_with("http://0.0.0.0")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::MessageContent;

    use crate::models::ContentBlock;
    use executor::{
        detect_content_loop, hash_tool_call, tool_call_to_legacy, CONTENT_CHUNK_SIZE,
        CONTENT_LOOP_CHUNK_THRESHOLD, LOOP_DETECTION_THRESHOLD,
    };
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

    #[test]
    fn test_build_tool_definitions_count() {
        let defs = build_tool_definitions();
        assert_eq!(defs.len(), 43);
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
        let file = tempfile::NamedTempFile::new_in(".").expect("file under workspace");
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
        let mut session = AgentSession::new("llama3", &ctx, None);
        assert_eq!(session.privacy_mode, PrivacyMode::Local);

        session.switch_model("gpt-5.5");

        assert_eq!(session.privacy_mode, PrivacyMode::Local);
        assert!(session.validate_privacy_boundary().is_err());

        session.set_privacy_mode(PrivacyMode::Byok);
        assert!(session.validate_privacy_boundary().is_ok());
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
        let session = AgentSession::new("claude-sonnet-4-5", &ctx, None);

        assert_eq!(session.privacy_mode, PrivacyMode::Byok);
        assert!(session.validate_privacy_boundary().is_ok());
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
        let mut session = AgentSession::new("claude-sonnet-4-5", &ctx, None);
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
        let mut session = AgentSession::new("claude-opus-4-6", &ctx, None);
        assert!(!session.fast_mode);

        session.toggle_fast_mode(Some("claude-haiku-4-5-20251001"));
        assert!(session.fast_mode);
        assert_eq!(session.model, "claude-haiku-4-5-20251001");

        session.toggle_fast_mode(None);
        assert!(!session.fast_mode);
        assert_eq!(session.model, "claude-opus-4-6");
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
}
