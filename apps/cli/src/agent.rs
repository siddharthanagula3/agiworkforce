use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use anyhow::Result;
use colored::Colorize;
use serde::{Deserialize, Serialize};

use crate::compaction;
use crate::config::CliConfig;
use crate::context::SystemContext;
use crate::errors::CliError;
use crate::hooks;
use crate::mcp;
use crate::memory::{self, MemoryManager};
#[cfg(test)]
use crate::models::ToolDefinition;
use crate::models::{self, ContentBlock, Message, Provider, StreamCallback, ToolCallResponse};
use crate::runtime::session::ManagedSession;
use crate::skills;
use crate::subagent;
use crate::teams;
use crate::tools;
use futures_util::future::join_all;

// ---------------------------------------------------------------------------
// Tool definitions (native API JSON Schema)
// ---------------------------------------------------------------------------

/// Build native API tool definitions with JSON Schema for each tool.
#[cfg(test)]
fn build_tool_definitions() -> Vec<ToolDefinition> {
    crate::runtime::tool_catalog::built_in_tool_definitions()
}

/// Build team-specific tool definitions (only included when team mode is active).
#[cfg(test)]
fn build_team_tool_definitions() -> Vec<ToolDefinition> {
    crate::runtime::tool_catalog::team_tool_definitions()
}

/// Maximum agentic loop iterations to prevent infinite loops.
const MAX_AGENTIC_ITERATIONS: usize = 25;

/// Number of consecutive identical tool calls before triggering loop detection.
const LOOP_DETECTION_THRESHOLD: usize = 5;

/// Sliding window size (in chars) for content chanting detection.
const CONTENT_CHUNK_SIZE: usize = 50;

/// Number of identical content chunks within the distance window to flag a content loop.
const CONTENT_LOOP_CHUNK_THRESHOLD: usize = 10;

/// Maximum character distance between first and last matching chunk to trigger detection.
/// Must be >= (CONTENT_LOOP_CHUNK_THRESHOLD - 1) * CONTENT_CHUNK_SIZE for the check to work.
const CONTENT_LOOP_DISTANCE: usize = 500;

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
    pub turn_count: u32,
    /// Accumulated real-dollar cost for this session. Updated via cost_ledger after each turn.
    pub cost_ledger: crate::cost_ledger::CostLedger,
    /// Optional ordered list of fallback model IDs. If set and a turn fails
    /// with a transient error, the next model is tried before surfacing the
    /// failure. See `crate::routing::fallback`.
    pub fallback_chain: Option<crate::routing::fallback::FallbackChain>,
    /// Demo mode: when `true`, the very next model call synthesizes a
    /// `CliError::RateLimited` instead of hitting the network. Cleared after
    /// it fires once so the fallback path executes normally afterwards.
    pub demo_force_rate_limit: bool,
    /// CLI-4 (audit 2026-05-03): when `true`, every fallback call is also
    /// mocked instead of hitting the real upstream — guarantees `--demo`
    /// never burns a real billable call even when API keys are configured.
    /// Set whenever `demo_force_rate_limit` is set; persists for the full
    /// session so subsequent turns also synthesize.
    pub demo_mode: bool,
    /// Active output style name (`default`, `explanatory`, `learning`, or a
    /// user-defined entry from `~/.agiworkforce/output-styles/`).
    #[allow(dead_code)]
    pub output_style: String,
    /// Optional sink for fallback rotation notifications. Wired by the CLI
    /// when `--json-events` is set so the operator can pipe rotations to
    /// `jq` / dashboards.
    #[allow(clippy::type_complexity)]
    pub on_fallback: Option<FallbackSink>,
    /// Recent tool calls for loop detection (name + args hash).
    recent_tool_calls: Vec<u64>,
    /// Number of loop detections (tool or content) in this session.
    loop_strike_count: u32,
    /// Hooks configuration (loaded once at session start).
    hooks_config: hooks::HooksConfig,
    /// Optional MCP server manager for external tools.
    mcp_manager: Option<mcp::McpManager>,
    /// Maximum agentic loop iterations (overrides MAX_AGENTIC_ITERATIONS when set).
    pub max_turns: Option<usize>,
    /// Plan mode: only read-only tools allowed (read_file, search_files, list_directory, web_search, web_fetch).
    pub plan_mode: bool,
    /// Sprint B4: tracked permission mode for the session. Mirrors
    /// `--mode {plan|default|...}` from the CLI and the 3-state `/plan`
    /// command at runtime. The mutating-tool gate uses this together
    /// with `plan_approved` to decide whether to allow a tool call.
    pub permission_mode: crate::cli_options::PermissionMode,
    /// Sprint B4: real plan mode -- true once the user has approved the
    /// current plan, unlocking mutating tools. Independent of `plan_mode`
    /// (the read-only-tool gate) so headless flows can flip approval
    /// without touching that gate.
    pub plan_approved: bool,
    /// Sprint B4: latest plan written by the model via `update_plan`.
    /// Cleared on `/plan reject` and `/clear`.
    pub current_plan: Option<crate::plan_mode::Plan>,
    /// Sprint B4: path of the on-disk markdown rendering of the current
    /// plan (`~/.agiworkforce/plans/<session-id>.md`). Set by the
    /// `update_plan` tool handler.
    pub current_plan_path: Option<std::path::PathBuf>,
    /// Sprint B4: queued one-shot feedback string from `/plan reject`. The
    /// next user-message send prepends this to the prompt so the model
    /// sees why the plan was rejected, then clears the field.
    pub plan_rejection_feedback: Option<String>,
    /// Sprint B4: in headless mode, auto-approve the first complete plan
    /// the model writes via `update_plan`. Set from `--auto-approve-plan`.
    pub auto_approve_plan: bool,
    /// Skip all tool confirmation prompts.
    pub skip_permissions: bool,
    /// Auto-approve safe tools (reads, searches) — skip confirmation for them.
    pub auto_approve_safe: bool,
    /// Quiet mode: suppress tool execution details, only show final output.
    pub quiet: bool,
    /// Fast mode: use a cheaper/faster model for responses.
    #[allow(dead_code)]
    pub fast_mode: bool,
    /// The original model (saved when switching to fast mode).
    #[allow(dead_code)]
    original_model: Option<String>,
    /// Conversation checkpoints for /rewind.
    checkpoints: Vec<Vec<Message>>,
    /// Optional session name (from --name flag).
    #[allow(dead_code)]
    pub session_name: Option<String>,
    /// Fallback model to try on primary model failure (from --fallback-model flag).
    #[allow(dead_code)]
    pub fallback_model: Option<String>,
    /// Optional allowlist of tools this session may use. When `Some`, only
    /// tools whose names appear in the list are available. Used by A2A
    /// delegated tasks to restrict external agents to a safe tool subset.
    pub allowed_tools: Option<Vec<String>>,
    /// Subagent manager for parallel task execution.
    subagent_manager: Option<subagent::SubagentManager>,
    /// Optional team manager for teammate messaging and shared tasks.
    team_manager: Option<teams::TeamManager>,
    /// Managed session snapshot persisted under ~/.agiworkforce/managed_sessions.
    managed_session: Option<ManagedSession>,
    /// Path of the managed session file backing this session.
    managed_session_path: Option<PathBuf>,
}

/// Metadata returned after a single agent turn.
pub struct TurnResult {
    pub response: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    /// Tokens read from prompt cache during this turn (Anthropic only).
    /// Already counted inside `input_tokens` for billing — surface separately
    /// for telemetry and the cost HUD.
    pub cache_read_tokens: u32,
    /// Tokens written to prompt cache during this turn (Anthropic only).
    /// Already counted inside `input_tokens` for billing — surface separately
    /// for telemetry and the cost HUD.
    pub cache_creation_tokens: u32,
    /// True when the request was routed through a subscription (Copilot, ChatGPT Plus).
    pub via_subscription: bool,
}

impl AgentSession {
    /// Create a new agent session with the system prompt.
    ///
    /// Accepts optional system context (cwd, git, os info) and a custom
    /// system prompt override. If `custom_system_prompt` is provided it
    /// replaces the default base prompt but the system context is still
    /// appended.
    pub fn new(
        model: &str,
        sys_context: &SystemContext,
        custom_system_prompt: Option<&str>,
    ) -> Self {
        let provider = models::detect_provider(model);
        let hooks_config = hooks::load_hooks().unwrap_or_default();

        // Load project instruction files (AGENTS.md, CLAUDE.md, etc.)
        let instructions = std::env::current_dir()
            .ok()
            .and_then(|cwd| compaction::load_instructions(&cwd));

        // Load hierarchical memory (global -> project -> local)
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

        // Capture shell environment snapshot at session start (best-effort)
        let session_id = uuid::Uuid::new_v4().to_string();
        if let Ok(home) = crate::config::CliConfig::config_dir() {
            crate::shell_snapshot::ShellSnapshot::capture(&home, &session_id);
            crate::shell_snapshot::ShellSnapshot::cleanup_stale(&home);
        }

        // Load persistent memory from the memory pipeline
        let persistent_memory = crate::config::CliConfig::config_dir()
            .ok()
            .map(|home| crate::memory_pipeline::MemoryPipeline::load_persistent_memory(&home))
            .unwrap_or_default();

        // Discover and format skills for system prompt injection
        let discovered = skills::discover_skills();
        let skill_refs: Vec<&skills::Skill> = discovered.iter().collect();
        let skills_content = skills::format_skills_for_prompt(&skill_refs);

        // Load glob-matched rules (.agiworkforce/rules/*.md)
        let rules = std::env::current_dir()
            .ok()
            .map(|cwd| memory::load_rules(&cwd))
            .unwrap_or_default();
        let rules_context = if rules.is_empty() {
            String::new()
        } else {
            // At session start, include rules with no globs (always-active).
            // Glob-specific rules are injected later when files are known.
            memory::rules_context_prompt(&rules, &[])
        };

        // Combine memory context with persistent memory from the pipeline
        let combined_memory = if persistent_memory.is_empty() {
            memory_context
        } else {
            format!("{}\n{}", memory_context, persistent_memory)
        };

        let system_message = Message::text(
            "system",
            build_system_prompt(
                sys_context,
                custom_system_prompt,
                instructions.as_deref(),
                &skills_content,
                &combined_memory,
                &rules_context,
            ),
        );

        Self {
            messages: vec![system_message],
            model: model.to_string(),
            provider,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cache_read_tokens: 0,
            total_cache_creation_tokens: 0,
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
            subagent_manager: None,
            team_manager: None,
            managed_session: None,
            managed_session_path: None,
        }
    }

    /// Enable team mode — initializes the team manager for teammate coordination.
    pub fn enable_team_mode(&mut self) {
        self.team_manager = Some(teams::TeamManager::new());
    }

    /// Get a reference to the team manager (if team mode is active).
    #[allow(dead_code)]
    pub fn team_manager(&self) -> Option<&teams::TeamManager> {
        self.team_manager.as_ref()
    }

    /// Spawn a teammate into the team (requires team mode to be enabled).
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
    /// Must be called with the config before the agent can spawn subagents.
    #[allow(dead_code)]
    pub fn init_subagent_manager(&mut self, config: &CliConfig, sys_context: &SystemContext) {
        self.subagent_manager = Some(subagent::SubagentManager::new(
            config.clone(),
            self.model.clone(),
            sys_context.clone(),
            self.skip_permissions,
        ));
    }

    /// Generate an A2A AgentCard representing this session's capabilities.
    ///
    /// The card advertises the current model, available tool names, and
    /// a default endpoint. Callers can override the endpoint before
    /// publishing the card.
    #[allow(dead_code)]
    pub fn a2a_card(&self) -> crate::a2a::AgentCard {
        let tool_names: Vec<String> = crate::runtime::tool_catalog::effective_tool_definitions(
            false,
            self.team_manager.is_some(),
            self.allowed_tools.as_deref(),
            None,
        )
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
        self.model = model.to_string();
        self.provider = models::detect_provider(model);
    }

    /// Override the provider (e.g. from config `default.provider`).
    ///
    /// Call after `new()` to apply a config-based provider override
    /// that takes precedence over model-name-based detection.
    pub fn set_provider_override(&mut self, provider_name: &str) {
        if let Some(p) = models::provider_from_name(provider_name) {
            self.provider = p;
        }
    }

    /// Switch the active output style. Appends the style preamble to the
    /// existing system message so the change applies on the next turn
    /// without losing prior conversation context.
    #[allow(dead_code)]
    pub fn apply_output_style(&mut self, style_name: &str) {
        let style = crate::output_styles::resolve(style_name);
        self.output_style = style.name.clone();
        if let Some(system_msg) = self.messages.first_mut() {
            if system_msg.role == "system" {
                let mut text = system_msg.text_content();
                // Strip any prior style preamble so styles are mutually
                // exclusive — re-applying default removes the override.
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
        self.messages.truncate(1); // keep system prompt
        self.turn_count = 0;
        self.recent_tool_calls.clear();
        self.loop_strike_count = 0;
        // Sprint B4: a fresh conversation starts with a fresh plan.
        self.reset_plan_state();
    }

    /// Sprint B4: clear all four plan-mode state fields. Called from
    /// `/clear` and `/plan off`. Does NOT touch `plan_mode` (the read-only
    /// tool gate) -- the slash command owns that.
    pub fn reset_plan_state(&mut self) {
        self.plan_approved = false;
        self.current_plan = None;
        self.current_plan_path = None;
        self.plan_rejection_feedback = None;
    }

    /// Sprint B4: handle a model `update_plan` tool call. Parses the args,
    /// stores the plan on the session, persists to disk under
    /// `~/.agiworkforce/plans/<session-id>.md`, and -- if
    /// `auto_approve_plan` is set -- flips the approval bit so headless
    /// flows (`-p --mode plan --auto-approve-plan`) proceed end-to-end
    /// without a prompt. Returns the JSON result the model should see.
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

        // Persist to disk; non-fatal if the home dir is unavailable.
        let path_result = plan.write_to_disk(&session_id);
        match &path_result {
            Ok(p) => self.current_plan_path = Some(p.clone()),
            Err(e) => {
                eprintln!(
                    "  warning: could not persist plan to disk: {e:#}"
                );
            }
        }

        let was_approved = self.plan_approved;
        self.current_plan = Some(plan);

        // Headless auto-approval -- only on the first plan write so that
        // explicit `/plan reject` from a follow-up still requires the
        // model to revise.
        if self.auto_approve_plan && !was_approved {
            self.plan_approved = true;
        }

        let path_str = self
            .current_plan_path
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "<unwritten>".to_string());

        let message = if matches!(self.permission_mode, crate::cli_options::PermissionMode::Plan)
            && !self.plan_approved
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

    /// Adopt an existing managed session as the persistence backing for this session.
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
        self.managed_session
            .as_ref()
            .map(|managed_session| managed_session.session_id.as_str())
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

    /// Normalize conversation history: ensure every tool_use call has a
    /// matching tool_result. Orphaned calls (e.g., from interrupted turns)
    /// get synthetic "aborted" results so the LLM API doesn't reject the
    /// malformed history.
    ///
    /// Ensures orphaned tool_use calls get synthetic results.
    #[allow(dead_code)]
    pub fn normalize_history(&mut self) {
        use crate::models::ContentBlock;

        let mut pending_call_ids: Vec<String> = Vec::new();
        let mut result_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

        // Pass 1: collect all tool_use IDs and tool_result IDs
        for msg in &self.messages {
            if let crate::models::MessageContent::Blocks(blocks) = &msg.content {
                for block in blocks {
                    match block {
                        ContentBlock::ToolUse { id, .. } => {
                            pending_call_ids.push(id.clone());
                        }
                        ContentBlock::ToolResult { tool_use_id, .. } => {
                            result_ids.insert(tool_use_id.clone());
                        }
                        _ => {}
                    }
                }
            }
        }

        // Pass 2: find orphaned calls (have tool_use but no matching tool_result)
        let orphans: Vec<String> = pending_call_ids
            .into_iter()
            .filter(|id| !result_ids.contains(id))
            .collect();

        // Pass 3: inject synthetic "aborted" results for each orphan
        for orphan_id in orphans {
            self.messages.push(crate::models::Message::blocks(
                "user",
                vec![ContentBlock::ToolResult {
                    tool_use_id: orphan_id,
                    content: "[Tool call was aborted — no output produced]".to_string(),
                    is_error: true,
                }],
            ));
        }
    }

    /// Attach an MCP server manager (for external tool discovery and execution).
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

    /// Get the hooks configuration (for firing hooks from the REPL).
    pub fn hooks_config(&self) -> &hooks::HooksConfig {
        &self.hooks_config
    }

    /// Return a formatted context usage report.
    pub fn context_report(&self) -> String {
        let usage = compaction::context_usage(&self.messages, &self.model);
        compaction::format_context_report(&usage)
    }

    /// Save a checkpoint of the current conversation state.
    pub fn save_checkpoint(&mut self) {
        self.checkpoints.push(self.messages.clone());
    }

    /// Restore the most recent checkpoint, returning true if one was available.
    #[allow(dead_code)]
    pub fn restore_checkpoint(&mut self) -> bool {
        if let Some(saved) = self.checkpoints.pop() {
            self.messages = saved;
            true
        } else {
            false
        }
    }

    /// Number of saved checkpoints.
    #[allow(dead_code)]
    pub fn checkpoint_count(&self) -> usize {
        self.checkpoints.len()
    }

    /// Toggle fast mode on/off. When enabled, switches to a faster model.
    /// When disabled, restores the original model.
    #[allow(dead_code)]
    pub fn toggle_fast_mode(&mut self, fast_model: Option<&str>) {
        if self.fast_mode {
            // Disable fast mode: restore original model
            if let Some(ref original) = self.original_model.take() {
                self.model = original.clone();
                self.provider = crate::models::detect_provider(&self.model);
            }
            self.fast_mode = false;
        } else {
            // Enable fast mode: save current model and switch
            // Documented fast-mode fallback (rule-models-json exception): used only
            // when the caller provides no explicit fast_model. Caller is expected to
            // pass a catalog-resolved slug; this literal is the last-resort default.
            let target = fast_model
                .unwrap_or("claude-haiku-4-5-20251001")
                .to_string();
            self.original_model = Some(self.model.clone());
            self.model = target.clone();
            self.provider = crate::models::detect_provider(&target);
            self.fast_mode = true;
        }
    }

    /// Send a side query (/btw) — runs in a temporary fork, doesn't affect main history.
    /// Returns the response text.
    #[allow(dead_code)]
    pub async fn send_btw(
        &self,
        config: &crate::config::CliConfig,
        question: &str,
        on_chunk: StreamCallback,
    ) -> Result<String> {
        // Create a lightweight fork: only system prompt + the side question
        let mut fork_messages = Vec::new();
        if let Some(sys) = self.messages.first() {
            fork_messages.push(sys.clone());
        }
        fork_messages.push(Message::text("user", question));

        let max_tokens = config.default.max_tokens;

        let result = crate::models::stream_completion(
            config,
            &self.provider,
            &self.model,
            &fork_messages,
            max_tokens,
            None, // No tools for side queries
            on_chunk,
        )
        .await?;

        Ok(result.text)
    }

    /// Send a user message and run the full agentic loop.
    ///
    /// The loop:
    /// 1. Send messages to LLM with native tool definitions
    /// 2. Check if response includes tool calls (via API)
    /// 3. If tools found: execute them, append results as structured messages, re-send to LLM
    /// 4. Repeat until no tool calls or max iterations reached
    /// 5. Return the final text response
    pub async fn send(
        &mut self,
        config: &CliConfig,
        user_input: &str,
        on_chunk: StreamCallback,
    ) -> Result<TurnResult> {
        // Context compaction: if above 90%, shrink to 70%
        let usage = compaction::context_usage(&self.messages, &self.model);
        if usage.fraction > 0.90 {
            let target = usage.limit_tokens * 70 / 100;
            // Sprint S4b: PreCompact hook — let handlers observe / annotate
            // before the transcript shrinks. Currently advisory; future
            // extensions may use `{"decision": "block"}` to skip compaction
            // (with the caller responsible for handling near-overflow state).
            let pre_hcfg = self.hooks_config.clone();
            hooks::run_hooks(
                &pre_hcfg,
                hooks::HookEvent::PreCompact,
                &hooks::HookInput {
                    event: "PreCompact".to_string(),
                    session_id: None,
                    model: Some(self.model.clone()),
                    tool_name: None,
                    tool_args: None,
                    tool_output: None,
                    message: Some(format!(
                        "context_usage_before_compact: {}/{} tokens ({}%)",
                        usage.used_tokens,
                        usage.limit_tokens,
                        (usage.fraction * 100.0) as u32
                    )),
                    tool_execution: None,
                },
            )
            .await;

            self.messages = compaction::compact_messages(&self.messages, target);
            let new_usage = compaction::context_usage(&self.messages, &self.model);
            eprintln!(
                "  {}",
                format!(
                    "Context compacted: {}",
                    compaction::format_context_report(&new_usage)
                )
                .dimmed()
            );

            // Sprint S4b: PostCompact hook — observe the new state for
            // metrics / logging / persistence side effects.
            hooks::run_hooks(
                &pre_hcfg,
                hooks::HookEvent::PostCompact,
                &hooks::HookInput {
                    event: "PostCompact".to_string(),
                    session_id: None,
                    model: Some(self.model.clone()),
                    tool_name: None,
                    tool_args: None,
                    tool_output: None,
                    message: Some(format!(
                        "context_usage_after_compact: {}/{} tokens ({}%)",
                        new_usage.used_tokens,
                        new_usage.limit_tokens,
                        (new_usage.fraction * 100.0) as u32
                    )),
                    tool_execution: None,
                },
            )
            .await;
        } else if usage.near_limit {
            eprintln!(
                "  {}",
                format!("Warning: {}", compaction::format_context_report(&usage)).yellow()
            );
        }

        // Add user message. Sprint B4: prepend two transient blocks when
        // applicable -- (1) a one-shot rejection feedback if `/plan
        // reject` queued one, (2) a per-turn plan-mode reminder so the
        // model knows mutating tools require `update_plan` + approval.
        // Both prepend to the user-visible input so the model sees them
        // alongside the actual question. The reminder is re-added every
        // turn (not baked into the system prompt) because plan mode and
        // approval state can flip mid-conversation via `/plan`.
        let mut prefix = String::new();
        if let Some(feedback) = self.plan_rejection_feedback.take() {
            prefix.push_str(&format!(
                "USER REJECTED THE PREVIOUS PLAN. FEEDBACK: {feedback}\n\n"
            ));
        }
        if matches!(self.permission_mode, crate::cli_options::PermissionMode::Plan)
            && !self.plan_approved
        {
            prefix.push_str(
                "[plan-mode] You must call the `update_plan` tool with a complete, ordered plan \
of steps before any mutating action (run_command, edit_file, write_file, apply_patch, MCP tools, \
task subagents). The user reviews and approves the plan; only then can you execute mutating \
tools. If your plan is rejected, the rejection feedback will be prefixed to the next user \
message -- revise and call `update_plan` again.\n\n"
            );
        }
        let effective_input = if prefix.is_empty() {
            user_input.to_string()
        } else {
            format!("{prefix}{user_input}")
        };
        self.messages.push(Message::text("user", &effective_input));

        // Save checkpoint for /rewind
        self.save_checkpoint();

        if let Err(error) = self.persist_managed_session() {
            eprintln!(
                "{}",
                format!("  warning: failed to persist managed session: {error:#}").yellow()
            );
        }

        let max_tokens = config.default.max_tokens;

        // Merge built-in tool definitions with MCP tools
        let mcp_tool_definitions = self
            .mcp_manager
            .as_ref()
            .map(|mcp_manager| mcp_manager.tool_definitions());
        let tool_defs = crate::runtime::tool_catalog::effective_tool_definitions(
            self.plan_mode,
            self.team_manager.is_some(),
            self.allowed_tools.as_deref(),
            mcp_tool_definitions.as_deref(),
        );
        let available_tool_names = tool_defs
            .iter()
            .map(|tool_definition| tool_definition.name.as_str())
            .collect::<std::collections::HashSet<_>>();

        // Sprint S4b: BeforePromptBuild + BeforeModelResolve.
        // Run as a pair right before the first LLM call. BeforePromptBuild
        // gives hooks a chance to inject context (logged for observation in
        // v1; future versions can use `additional_context` to mutate
        // self.messages). BeforeModelResolve is the latest deterministic
        // override point for the model id before bytes leave the agent.
        let pre_call_hcfg = self.hooks_config.clone();
        hooks::run_hooks(
            &pre_call_hcfg,
            hooks::HookEvent::BeforePromptBuild,
            &hooks::HookInput {
                event: "BeforePromptBuild".to_string(),
                session_id: None,
                model: Some(self.model.clone()),
                tool_name: None,
                tool_args: None,
                tool_output: None,
                message: Some(format!(
                    "messages_count={} tools_count={}",
                    self.messages.len(),
                    tool_defs.len()
                )),
                tool_execution: None,
            },
        )
        .await;
        hooks::run_hooks(
            &pre_call_hcfg,
            hooks::HookEvent::BeforeModelResolve,
            &hooks::HookInput {
                event: "BeforeModelResolve".to_string(),
                session_id: None,
                model: Some(self.model.clone()),
                tool_name: None,
                tool_args: None,
                tool_output: None,
                message: None,
                tool_execution: None,
            },
        )
        .await;

        // --- First LLM call (with user's streaming callback) ---
        // Demo hook: if the operator passed `--demo`, synthesize a 429 on the
        // very first call so the fallback chain visibly fires. Cleared after
        // it triggers so subsequent turns behave normally.
        let first_call_result = if self.demo_force_rate_limit {
            self.demo_force_rate_limit = false;
            eprintln!(
                "  {}",
                "DEMO: synthesizing rate-limit on primary model".dimmed()
            );
            Err(anyhow::Error::new(CliError::RateLimited {
                provider: format!("{:?}", self.provider).to_lowercase(),
                retry_after: Some(0),
            }))
        } else {
            models::stream_completion(
                config,
                &self.provider,
                &self.model,
                &self.messages,
                max_tokens,
                Some(&tool_defs),
                on_chunk,
            )
            .await
        };
        let result = match first_call_result {
            Ok(r) => r,
            Err(e) => {
                // First: in-place retry if the error self-classifies as
                // retryable. Skip the retry when a fallback chain is set AND
                // the error rotates the chain — the operator's intent is to
                // jump providers, not burn a redundant retry.
                let mut last_err = e;
                let mut recovered: Option<_> = None;
                let prefer_fallback = self
                    .fallback_chain
                    .as_ref()
                    .zip(last_err.downcast_ref::<CliError>())
                    .map(|(chain, err)| chain.should_rotate(err))
                    .unwrap_or(false);
                if !prefer_fallback {
                    if let Some(cli_err) = last_err.downcast_ref::<CliError>() {
                        if cli_err.is_retryable() {
                            let delay = cli_err.retry_delay();
                            eprintln!(
                                "  {}",
                                format!("Retrying in {}s: {}", delay.as_secs(), cli_err).yellow()
                            );
                            tokio::time::sleep(delay).await;
                            match models::stream_completion(
                                config,
                                &self.provider,
                                &self.model,
                                &self.messages,
                                max_tokens,
                                Some(&tool_defs),
                                Box::new(|chunk| print!("{}", chunk)),
                            )
                            .await
                            {
                                Ok(r) => recovered = Some(r),
                                Err(retry_err) => last_err = retry_err,
                            }
                        }
                    }
                }
                // Second: walk the fallback chain. We mutate `self.model` so
                // downstream HUD/events reflect the model that actually
                // answered.
                if recovered.is_none() {
                    if let Some(chain) = self.fallback_chain.clone() {
                        let cli_err_kind = last_err
                            .downcast_ref::<CliError>()
                            .map(|c| (c.kind(), chain.should_rotate(c)));
                        if let Some((kind, true)) = cli_err_kind {
                            for fallback_model in chain.tail() {
                                let prev_model = self.model.clone();
                                self.model = fallback_model.clone();
                                self.provider = crate::models::detect_provider(fallback_model);
                                eprintln!(
                                    "  {}",
                                    format!(
                                        "↘ Falling back: {} → {} ({})",
                                        prev_model, fallback_model, kind
                                    )
                                    .yellow()
                                );
                                if let Some(sink) = self.on_fallback.as_ref() {
                                    (sink.0)(&prev_model, fallback_model, kind);
                                }
                                // CLI-4 (audit 2026-05-03): in demo mode,
                                // synthesize the fallback response instead of
                                // hitting the real upstream. This guarantees
                                // `--demo` never burns a real billable call
                                // even when API keys are configured.
                                let fallback_call = if self.demo_mode {
                                    let demo_text = format!(
                                        "[DEMO MODE] Synthesized response from `{}` — no real \
                                         API call was made. The fallback chain is exercised but \
                                         the upstream provider was not contacted.",
                                        fallback_model
                                    );
                                    print!("{}", demo_text);
                                    Ok(crate::models::CompletionResult {
                                        text: demo_text,
                                        tool_calls: vec![],
                                        input_tokens: 0,
                                        output_tokens: 0,
                                        cache_read_input_tokens: 0,
                                        cache_creation_input_tokens: 0,
                                        via_subscription: true,
                                        stop_reason: Some("end_turn".to_string()),
                                    })
                                } else {
                                    models::stream_completion(
                                        config,
                                        &self.provider,
                                        &self.model,
                                        &self.messages,
                                        max_tokens,
                                        Some(&tool_defs),
                                        Box::new(|chunk| print!("{}", chunk)),
                                    )
                                    .await
                                };
                                match fallback_call {
                                    Ok(r) => {
                                        recovered = Some(r);
                                        break;
                                    }
                                    Err(rotate_err) => last_err = rotate_err,
                                }
                            }
                        }
                    }
                }
                match recovered {
                    Some(r) => r,
                    None => return Err(last_err),
                }
            }
        };

        // Build the assistant message with both text and tool_use blocks
        let assistant_msg = build_assistant_message(&result.text, &result.tool_calls);
        self.messages.push(assistant_msg);

        let mut total_input = result.input_tokens;
        let mut total_output = result.output_tokens;
        let mut total_cache_read = result.cache_read_input_tokens;
        let mut total_cache_creation = result.cache_creation_input_tokens;
        let via_subscription = result.via_subscription;
        let mut final_response = result.text;
        let mut current_tool_calls = result.tool_calls;

        // --- Agentic loop: check for tool calls and iterate ---
        let effective_max = self.max_turns.unwrap_or(MAX_AGENTIC_ITERATIONS);
        for iteration in 0..effective_max {
            if current_tool_calls.is_empty() {
                break; // No tools -- we're done
            }

            // --- Doom loop detection ---
            let call_hashes: Vec<u64> = current_tool_calls
                .iter()
                .map(|tc| hash_tool_call(&tc.name, &tc.arguments))
                .collect();

            self.recent_tool_calls.extend(&call_hashes);

            // Check if last LOOP_DETECTION_THRESHOLD calls are identical
            if self.recent_tool_calls.len() >= LOOP_DETECTION_THRESHOLD {
                let tail = &self.recent_tool_calls
                    [self.recent_tool_calls.len() - LOOP_DETECTION_THRESHOLD..];
                if tail.windows(2).all(|w| w[0] == w[1]) {
                    self.loop_strike_count += 1;

                    if self.loop_strike_count >= 2 {
                        eprintln!(
                            "\n{}",
                            "  Auto-stopping: second loop detected in this session.".red()
                        );
                        break;
                    }

                    eprintln!(
                        "\n{}",
                        format!(
                            "  Warning: Detected {} identical consecutive tool calls ({}). Possible loop. [strike {}/2]",
                            LOOP_DETECTION_THRESHOLD,
                            current_tool_calls
                                .first()
                                .map(|tc| tc.name.as_str())
                                .unwrap_or("unknown"),
                            self.loop_strike_count
                        )
                        .yellow()
                    );

                    let confirmed = dialoguer::Confirm::new()
                        .with_prompt("Continue with these tool calls?")
                        .default(false)
                        .interact()
                        .unwrap_or(false);

                    if !confirmed {
                        eprintln!("{}", "  Agentic loop stopped by user.".dimmed());
                        break;
                    }

                    // Reset detection after user confirms
                    self.recent_tool_calls.clear();
                }
            }

            eprintln!(
                "\n{}",
                format!(
                    "  Executing {} tool{}... (iteration {}/{})",
                    current_tool_calls.len(),
                    if current_tool_calls.len() == 1 {
                        ""
                    } else {
                        "s"
                    },
                    iteration + 1,
                    effective_max
                )
                .dimmed()
            );

            // Clone hooks config to avoid borrow conflicts with mcp_manager
            let hcfg = self.hooks_config.clone();
            let mut result_blocks = Vec::new();

            // Phase 6/7: classify tools for the concurrent batch.
            // A tool is eligible for the concurrent built-in batch when:
            //   1. It's a built-in tool (not MCP, not team — those need
            //      access to shared mutable session state).
            //   2. Its `ToolDefinition.is_concurrency_safe` is true (currently
            //      the read-only built-ins: read_file, search_files,
            //      list_directory, web_search, web_fetch, grep_files, tool_search).
            //   3. The session is in non-prompting mode (`skip_permissions`).
            //      Otherwise the dialoguer confirmation prompts would
            //      interleave on the terminal.
            let concurrency_safe_names: std::collections::HashSet<String> = tool_defs
                .iter()
                .filter(|t| t.is_concurrency_safe)
                .map(|t| t.name.clone())
                .collect();
            let concurrent_eligible = |name: &str| -> bool {
                self.skip_permissions
                    && concurrency_safe_names.contains(name)
                    && !is_team_tool(name)
                    && !name.starts_with("mcp_")
                    && name != "task"
            };

            // Three-way partition: task tools (concurrent via SubagentManager),
            // concurrent built-ins (parallel via join_all), everything else
            // (sequential).
            let task_calls: Vec<_> = current_tool_calls
                .iter()
                .filter(|tc| tc.name == "task")
                .collect();
            let concurrent_calls: Vec<_> = current_tool_calls
                .iter()
                .filter(|tc| tc.name != "task" && concurrent_eligible(&tc.name))
                .collect();
            let other_calls: Vec<_> = current_tool_calls
                .iter()
                .filter(|tc| tc.name != "task" && !concurrent_eligible(&tc.name))
                .collect();

            // Spawn all task tool calls concurrently via subagent manager
            let mut task_spawn_results = Vec::new();
            for tc in &task_calls {
                if !available_tool_names.contains(tc.name.as_str()) {
                    result_blocks.push(ContentBlock::ToolResult {
                        tool_use_id: tc.id.clone(),
                        content: format!("Tool '{}' is not available in this session.", tc.name),
                        is_error: true,
                    });
                    continue;
                }

                // Sprint B4: block subagent spawns in unapproved plan mode
                // for the same reason we block bash/edit/write -- a task
                // subagent has the full mutating tool surface.
                if matches!(self.permission_mode, crate::cli_options::PermissionMode::Plan)
                    && !self.plan_approved
                {
                    let payload = serde_json::json!({
                        "ok": false,
                        "error": "plan_mode_unapproved",
                        "message": "Plan mode is active and the current plan has not been approved. Call `update_plan` first; subagent tasks are blocked until the user approves."
                    });
                    result_blocks.push(ContentBlock::ToolResult {
                        tool_use_id: tc.id.clone(),
                        content: payload.to_string(),
                        is_error: true,
                    });
                    continue;
                }

                hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::PreToolUse,
                    &hooks::HookInput {
                        event: "PreToolUse".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
                        tool_name: Some(tc.name.clone()),
                        tool_args: Some(tc.arguments.clone()),
                        tool_output: None,
                        message: None,
                        tool_execution: None,
                    },
                )
                .await;

                let description = tc
                    .arguments
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("subagent task")
                    .to_string();
                let prompt = tc
                    .arguments
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                // Lazily initialize the subagent manager if needed
                if self.subagent_manager.is_none() {
                    self.subagent_manager = Some(subagent::SubagentManager::new(
                        config.clone(),
                        self.model.clone(),
                        crate::context::gather_system_context(),
                        self.skip_permissions,
                    ));
                }

                // Sprint S13: SubagentStart fires before the spawn. Hook
                // observers see the description + prompt (truncated) so
                // dashboards can show "agent is spawning <task> for <prompt>"
                // in real time. The hook is observation-only; blocking is
                // already handled by the plan-mode gate above.
                hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::SubagentStart,
                    &hooks::HookInput {
                        event: "SubagentStart".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
                        tool_name: Some(tc.name.clone()),
                        tool_args: Some(tc.arguments.clone()),
                        tool_output: None,
                        message: Some(format!(
                            "subagent_spawn description={:?} prompt_len={}",
                            description,
                            prompt.len()
                        )),
                        tool_execution: None,
                    },
                )
                .await;

                // SAFETY: We just set subagent_manager above if it was None.
                let mgr = self
                    .subagent_manager
                    .as_ref()
                    .expect("subagent_manager was just initialized above");
                let id_result = mgr.spawn(&description, &prompt).await;

                // Sprint S13: SubagentStop fires after the spawn call returns.
                // For sync-spawn-then-poll managers, this signals the spawn
                // completed (whether successful or errored); the underlying
                // task may still be running async — observers wanting actual
                // task-end should listen on PostToolUse for the wrapping
                // task tool call (which fires when the result is collected).
                hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::SubagentStop,
                    &hooks::HookInput {
                        event: "SubagentStop".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
                        tool_name: Some(tc.name.clone()),
                        tool_args: Some(tc.arguments.clone()),
                        tool_output: id_result
                            .as_ref()
                            .ok()
                            .map(|id| format!("subagent_id={}", id)),
                        message: id_result
                            .as_ref()
                            .err()
                            .map(|err| format!("spawn_error: {:#}", err)),
                        tool_execution: None,
                    },
                )
                .await;

                task_spawn_results.push((
                    tc.id.clone(),
                    tc.name.clone(),
                    tc.arguments.clone(),
                    id_result,
                ));
            }

            // Wait for all task subagents to complete concurrently
            if !task_spawn_results.is_empty() {
                if let Some(ref mgr) = self.subagent_manager {
                    mgr.wait_all().await;
                }
            }

            // Collect task results
            for (tool_use_id, tool_name, tool_args, id_result) in task_spawn_results {
                let tool_result = match id_result {
                    Ok(ref id) => {
                        if let Some(ref mgr) = self.subagent_manager {
                            if let Some(sa_result) = mgr.get_result(id).await {
                                let mut output = sa_result.output;
                                if !sa_result.files_modified.is_empty() {
                                    output.push_str(
                                        "

Files modified:
",
                                    );
                                    for f in &sa_result.files_modified {
                                        output.push_str(&format!(
                                            "  - {}
",
                                            f
                                        ));
                                    }
                                }
                                tools::ToolResult {
                                    tool_name: "task".to_string(),
                                    success: true,
                                    output,
                                }
                            } else if let Some(sa_status) = mgr.get_status(id).await {
                                tools::ToolResult {
                                    tool_name: "task".to_string(),
                                    success: false,
                                    output: format!(
                                        "Subagent {} finished with status: {}",
                                        id, sa_status
                                    ),
                                }
                            } else {
                                tools::ToolResult {
                                    tool_name: "task".to_string(),
                                    success: false,
                                    output: format!("Subagent {} not found.", id),
                                }
                            }
                        } else {
                            tools::ToolResult {
                                tool_name: "task".to_string(),
                                success: false,
                                output: "Subagent manager not initialized.".to_string(),
                            }
                        }
                    }
                    Err(e) => tools::ToolResult {
                        tool_name: "task".to_string(),
                        success: false,
                        output: format!("Failed to spawn subagent: {:#}", e),
                    },
                };

                let sa_display_status = if tool_result.success {
                    "success".green().to_string()
                } else {
                    "failed".red().to_string()
                };
                eprintln!(
                    "  {} {} [{}]",
                    "->".dimmed(),
                    tool_name.bold(),
                    sa_display_status
                );

                hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::PostToolUse,
                    &hooks::HookInput {
                        event: "PostToolUse".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
                        tool_name: Some(tool_name.clone()),
                        tool_args: Some(tool_args.clone()),
                        tool_output: Some(tool_result.output.clone()),
                        message: None,
                        tool_execution: None,
                    },
                )
                .await;

                // Sprint S4b: ToolResultPersist — fires close to persistence
                // so storage-affecting hooks (PII redaction, secret scrubbing)
                // see the same payload that lands in the transcript.
                hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::ToolResultPersist,
                    &hooks::HookInput {
                        event: "ToolResultPersist".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
                        tool_name: Some(tool_name),
                        tool_args: Some(tool_args),
                        tool_output: Some(tool_result.output.clone()),
                        message: None,
                        tool_execution: None,
                    },
                )
                .await;

                result_blocks.push(ContentBlock::ToolResult {
                    tool_use_id,
                    content: tool_result.output,
                    is_error: !tool_result.success,
                });
            }

            // Phase 7: execute the concurrent batch via join_all. Each tool
            // runs its BeforeToolUse hook → exec → AfterToolUse hook in its
            // own future; results come back in arbitrary order, then we
            // append them to result_blocks. The original tool_call ordering
            // is preserved by `result_blocks` insertion order — the API
            // accepts tool_results in any order as long as tool_use_ids
            // match.
            if !concurrent_calls.is_empty() {
                if !self.quiet {
                    eprintln!(
                        "  {} ({})",
                        format!("running {} read-only tools in parallel", concurrent_calls.len())
                            .dimmed(),
                        concurrent_calls
                            .iter()
                            .map(|tc| tc.name.as_str())
                            .collect::<Vec<_>>()
                            .join(", ")
                    );
                }

                // Skip unavailable tools first (they don't get a future).
                let mut runnable: Vec<&ToolCallResponse> = Vec::new();
                for tc in &concurrent_calls {
                    if !available_tool_names.contains(tc.name.as_str()) {
                        result_blocks.push(ContentBlock::ToolResult {
                            tool_use_id: tc.id.clone(),
                            content: format!(
                                "Tool '{}' is not available in this session.",
                                tc.name
                            ),
                            is_error: true,
                        });
                        continue;
                    }
                    runnable.push(tc);
                }

                // BeforeToolUse hooks run serially to preserve hook stdout
                // ordering. They're typically fast (subprocess startup is the
                // dominant cost) so the gain from parallelizing them is
                // small relative to the risk of interleaved log output.
                for tc in &runnable {
                    hooks::run_hooks(
                        &hcfg,
                        hooks::HookEvent::PreToolUse,
                        &hooks::HookInput {
                            event: "PreToolUse".to_string(),
                            session_id: None,
                            model: Some(self.model.clone()),
                            tool_name: Some(tc.name.clone()),
                            tool_args: Some(tc.arguments.clone()),
                            tool_output: None,
                            message: None,
                            tool_execution: None,
                        },
                    )
                    .await;
                }

                // The actual concurrent batch: read-only built-in tools.
                let exec_opts = tools::ToolExecOptions {
                    require_confirmation: !self.skip_permissions,
                    auto_approve_safe: self.auto_approve_safe,
                    quiet: self.quiet,
                };
                let futures = runnable.iter().map(|tc| {
                    let legacy = tool_call_to_legacy(tc);
                    let opts = exec_opts.clone();
                    let id = tc.id.clone();
                    let name = tc.name.clone();
                    let args = tc.arguments.clone();
                    async move {
                        let result = tools::execute_tool_with_opts(&legacy, &opts).await;
                        (id, name, args, result)
                    }
                });
                let outcomes = join_all(futures).await;

                // AfterToolUse hooks + result_blocks insertion (serial, to
                // keep stdout ordering deterministic).
                for (tool_use_id, tool_name, tool_args, exec_result) in outcomes {
                    let tool_result = match exec_result {
                        Ok(r) => r,
                        Err(e) => tools::ToolResult {
                            tool_name: tool_name.clone(),
                            success: false,
                            output: format!("tool error: {:#}", e),
                        },
                    };

                    if !self.quiet {
                        let status = if tool_result.success {
                            "success".green().to_string()
                        } else {
                            "failed".red().to_string()
                        };
                        eprintln!(
                            "  {} {} [{}]",
                            "->".dimmed(),
                            tool_name.bold(),
                            status
                        );
                    }

                    hooks::run_hooks(
                        &hcfg,
                        hooks::HookEvent::PostToolUse,
                        &hooks::HookInput {
                            event: "PostToolUse".to_string(),
                            session_id: None,
                            model: Some(self.model.clone()),
                            tool_name: Some(tool_name.clone()),
                            tool_args: Some(tool_args.clone()),
                            tool_output: Some(tool_result.output.clone()),
                            message: None,
                            tool_execution: None,
                        },
                    )
                    .await;

                    // Sprint S4b: ToolResultPersist — runs after PostToolUse
                    // so its observers see the same payload about to be
                    // appended to result_blocks.
                    hooks::run_hooks(
                        &hcfg,
                        hooks::HookEvent::ToolResultPersist,
                        &hooks::HookInput {
                            event: "ToolResultPersist".to_string(),
                            session_id: None,
                            model: Some(self.model.clone()),
                            tool_name: Some(tool_name),
                            tool_args: Some(tool_args),
                            tool_output: Some(tool_result.output.clone()),
                            message: None,
                            tool_execution: None,
                        },
                    )
                    .await;

                    result_blocks.push(ContentBlock::ToolResult {
                        tool_use_id,
                        content: tool_result.output,
                        is_error: !tool_result.success,
                    });
                }
            }

            // Phase 10: collect additional_context messages emitted by
            // AfterToolUse hooks across this iteration. They're injected as a
            // single system message after all tool results, before the next
            // LLM call, so the model sees redaction notes etc. in order.
            let mut hook_additional_contexts: Vec<String> = Vec::new();

            // Execute non-task tool calls sequentially (as before)
            for tc in &other_calls {
                if !available_tool_names.contains(tc.name.as_str()) {
                    result_blocks.push(ContentBlock::ToolResult {
                        tool_use_id: tc.id.clone(),
                        content: format!("Tool '{}' is not available in this session.", tc.name),
                        is_error: true,
                    });
                    continue;
                }

                // Sprint B4: plan-mode gate. When the session is in plan
                // mode and the user has not approved the current plan,
                // refuse mutating tools. Returns a structured error so the
                // model knows to call `update_plan` first instead of
                // looping or surfacing a confusing failure.
                if matches!(self.permission_mode, crate::cli_options::PermissionMode::Plan)
                    && !self.plan_approved
                    && is_mutating_tool(&tc.name)
                {
                    let payload = serde_json::json!({
                        "ok": false,
                        "error": "plan_mode_unapproved",
                        "message": "Plan mode is active and the current plan has not been approved. Call `update_plan` with a complete ordered plan, then await user approval. Do NOT call mutating tools yet."
                    });
                    result_blocks.push(ContentBlock::ToolResult {
                        tool_use_id: tc.id.clone(),
                        content: payload.to_string(),
                        is_error: true,
                    });
                    continue;
                }

                // Phase 10: BeforeToolUse hooks may return updated_input to
                // rewrite tool args before exec. Last hook in the chain wins
                // (see aggregate_transformers).
                let pre_results = hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::PreToolUse,
                    &hooks::HookInput {
                        event: "PreToolUse".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
                        tool_name: Some(tc.name.clone()),
                        tool_args: Some(tc.arguments.clone()),
                        tool_output: None,
                        message: None,
                        tool_execution: None,
                    },
                )
                .await;
                let pre_t = hooks::aggregate_transformers(&pre_results);
                let effective_args = pre_t.updated_input.clone().unwrap_or_else(|| tc.arguments.clone());

                // Route: update_plan -> team tools -> MCP tools (mcp_*) -> built-in tools
                let legacy = ToolCall {
                    name: tc.name.clone(),
                    args: value_to_legacy_args(&effective_args),
                };
                let tool_result = if tc.name == "update_plan" {
                    // Sprint B4: handled inside the session so we can
                    // mutate `current_plan`, `current_plan_path`, and
                    // (in --auto-approve-plan mode) `plan_approved`.
                    let payload = self.handle_update_plan(&effective_args);
                    let success = payload.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
                    let message = payload
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("plan handled")
                        .to_string();
                    if !self.quiet {
                        let path_disp = self
                            .current_plan_path
                            .as_ref()
                            .map(|p| p.display().to_string())
                            .unwrap_or_default();
                        eprintln!(
                            "  {} {} ({}{})",
                            "->".dimmed(),
                            "update_plan".bold(),
                            message,
                            if path_disp.is_empty() { String::new() } else { format!(" -> {path_disp}") }
                        );
                    }
                    tools::ToolResult {
                        tool_name: "update_plan".to_string(),
                        success,
                        output: payload.to_string(),
                    }
                } else if is_team_tool(&tc.name) {
                    execute_team_tool(&self.team_manager, &tc.name, &legacy.args).await?
                } else if tc.name.starts_with("mcp_") {
                    execute_mcp_tool(&mut self.mcp_manager, &tc.name, effective_args.clone()).await?
                } else {
                    let opts = tools::ToolExecOptions {
                        require_confirmation: !self.skip_permissions,
                        auto_approve_safe: self.auto_approve_safe,
                        quiet: self.quiet,
                    };
                    tools::execute_tool_with_opts(&legacy, &opts).await?
                };

                if !self.quiet {
                    let status = if tool_result.success {
                        "success".green().to_string()
                    } else {
                        "failed".red().to_string()
                    };
                    eprintln!("  {} {} [{}]", "->".dimmed(), tc.name.bold(), status);
                }

                let post_results = hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::PostToolUse,
                    &hooks::HookInput {
                        event: "PostToolUse".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
                        tool_name: Some(tc.name.clone()),
                        tool_args: Some(effective_args.clone()),
                        tool_output: Some(tool_result.output.clone()),
                        message: None,
                        tool_execution: None,
                    },
                )
                .await;

                // Phase 10: AfterToolUse may rewrite the tool's output and
                // append context messages. Last writer wins on the output
                // override; additional_context accumulates.
                let post_t = hooks::aggregate_transformers(&post_results);
                let final_output = post_t.updated_mcp_tool_output.unwrap_or(tool_result.output);
                if let Some(ctx) = post_t.additional_context {
                    hook_additional_contexts.push(ctx);
                }

                // Sprint S4b: ToolResultPersist — fires *after* PostToolUse
                // transformations so observers see the final-as-persisted
                // payload (post-redaction etc.). This is the right place for
                // append-only audit sinks.
                hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::ToolResultPersist,
                    &hooks::HookInput {
                        event: "ToolResultPersist".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
                        tool_name: Some(tc.name.clone()),
                        tool_args: Some(effective_args.clone()),
                        tool_output: Some(final_output.clone()),
                        message: None,
                        tool_execution: None,
                    },
                )
                .await;

                result_blocks.push(ContentBlock::ToolResult {
                    tool_use_id: tc.id.clone(),
                    content: final_output,
                    is_error: !tool_result.success,
                });
            }

            // Send tool results as a structured user message
            self.messages.push(Message::blocks("user", result_blocks));

            // Phase 10: hook-injected advisory messages ride along after
            // the tool results so the model sees them before its next reply.
            if !hook_additional_contexts.is_empty() {
                let merged = hook_additional_contexts.join("\n\n");
                self.messages.push(Message::text("system", merged));
            }

            // Re-send to LLM with tool results
            eprintln!();
            let continuation = match models::stream_completion(
                config,
                &self.provider,
                &self.model,
                &self.messages,
                max_tokens,
                Some(&tool_defs),
                Box::new(|chunk| print!("{}", chunk)),
            )
            .await
            {
                Ok(r) => r,
                Err(e) => {
                    if let Some(cli_err) = e.downcast_ref::<CliError>() {
                        if cli_err.is_retryable() {
                            let delay = cli_err.retry_delay();
                            eprintln!(
                                "  {}",
                                format!("Retrying in {}s: {}", delay.as_secs(), cli_err).yellow()
                            );
                            tokio::time::sleep(delay).await;
                            models::stream_completion(
                                config,
                                &self.provider,
                                &self.model,
                                &self.messages,
                                max_tokens,
                                Some(&tool_defs),
                                Box::new(|chunk| print!("{}", chunk)),
                            )
                            .await?
                        } else {
                            return Err(e);
                        }
                    } else {
                        return Err(e);
                    }
                }
            };

            // Build and store the assistant's continuation message
            let cont_msg = build_assistant_message(&continuation.text, &continuation.tool_calls);
            self.messages.push(cont_msg);

            total_input += continuation.input_tokens;
            total_output += continuation.output_tokens;
            total_cache_read += continuation.cache_read_input_tokens;
            total_cache_creation += continuation.cache_creation_input_tokens;
            final_response = continuation.text;
            current_tool_calls = continuation.tool_calls;

            // Content chanting detection on the latest LLM text
            if detect_content_loop(&final_response) {
                self.loop_strike_count += 1;

                if self.loop_strike_count >= 2 {
                    eprintln!(
                        "\n{}",
                        "  Auto-stopping: second content loop detected in this session.".red()
                    );
                    break;
                }

                eprintln!(
                    "\n{}",
                    format!(
                        "  Warning: Detected repetitive content in LLM response. Possible content loop. [strike {}/2]",
                        self.loop_strike_count
                    )
                    .yellow()
                );

                let confirmed = dialoguer::Confirm::new()
                    .with_prompt("Continue the agentic loop?")
                    .default(false)
                    .interact()
                    .unwrap_or(false);

                if !confirmed {
                    eprintln!("{}", "  Agentic loop stopped by user.".dimmed());
                    break;
                }
            }
        }

        // Update session counters
        self.total_input_tokens += total_input;
        self.total_output_tokens += total_output;
        self.total_cache_read_tokens += total_cache_read;
        self.total_cache_creation_tokens += total_cache_creation;
        self.turn_count += 1;
        self.cost_ledger.record_turn(
            &self.model,
            total_input,
            total_output,
            total_cache_read,
            total_cache_creation,
        );

        // --- Post-turn: memory extraction + skill learning (best-effort, non-blocking) ---
        if let Ok(home) = crate::config::CliConfig::config_dir() {
            // Skill learner: collect tool names from messages to analyze patterns
            let tool_counts: Vec<(String, u32)> = {
                let mut counts: std::collections::HashMap<String, u32> =
                    std::collections::HashMap::new();
                for msg in &self.messages {
                    if let crate::models::MessageContent::Blocks(blocks) = &msg.content {
                        for block in blocks {
                            if let ContentBlock::ToolUse { name, .. } = block {
                                *counts.entry(name.clone()).or_insert(0) += 1;
                            }
                        }
                    }
                }
                counts.into_iter().collect()
            };
            if !tool_counts.is_empty() {
                let session_id = self.session_name.as_deref().unwrap_or("anonymous");
                if let Some(skill) = crate::skill_learner::SkillLearner::analyze_session(
                    &home,
                    session_id,
                    &tool_counts,
                    true, // completed turns are successful
                ) {
                    if let Err(e) = crate::skill_learner::SkillLearner::save_skill(&home, &skill) {
                        eprintln!("[skill_learner] failed to save learned skill: {}", e);
                    } else if !self.quiet {
                        eprintln!(
                            "  {} Learned skill: {} (confidence: {:.0}%)",
                            "auto".dimmed(),
                            skill.name,
                            skill.confidence * 100.0,
                        );
                    }
                }
            }

            // Memory pipeline: trigger consolidation check (max once per hour)
            if crate::memory_pipeline::MemoryPipeline::needs_consolidation(&home) {
                let home_clone = home.clone();
                let config_clone = config.clone();
                // Spawn consolidation as a non-blocking background task
                tokio::spawn(async move {
                    if let Err(e) = crate::memory_pipeline::MemoryPipeline::consolidate(
                        &home_clone,
                        &config_clone,
                    )
                    .await
                    {
                        eprintln!("[memory_pipeline] consolidation error: {}", e);
                    }
                });
            }
        }

        if let Err(error) = self.persist_managed_session() {
            eprintln!(
                "{}",
                format!("  warning: failed to persist managed session: {error:#}").yellow()
            );
        }

        Ok(TurnResult {
            response: final_response,
            input_tokens: total_input,
            output_tokens: total_output,
            cache_read_tokens: total_cache_read,
            cache_creation_tokens: total_cache_creation,
            via_subscription,
        })
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Detect content chanting: repeated identical chunks in LLM text output.
///
/// Splits the text into `CONTENT_CHUNK_SIZE`-char slices, hashes each, then
/// checks whether any single hash appears `CONTENT_LOOP_CHUNK_THRESHOLD`+
/// times within a `CONTENT_LOOP_DISTANCE`-char span.  Code blocks (delimited
/// by triple-backtick fences) are skipped to avoid false positives on
/// repeated code patterns.
fn detect_content_loop(text: &str) -> bool {
    if text.len() < CONTENT_CHUNK_SIZE * 2 {
        return false;
    }

    // Strip code blocks by toggling on ``` fences.
    let mut plain = String::with_capacity(text.len());
    let mut in_code_block = false;
    for line in text.lines() {
        if line.trim_start().starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }
        if !in_code_block {
            plain.push_str(line);
            plain.push('\n');
        }
    }

    if plain.len() < CONTENT_CHUNK_SIZE * 2 {
        return false;
    }

    // Collect (hash, char_offset) for each chunk.
    let chars: Vec<char> = plain.chars().collect();
    let mut chunk_entries: Vec<(u64, usize)> = Vec::new();
    let mut byte_offset: usize = 0;
    for chunk_start in
        (0..chars.len().saturating_sub(CONTENT_CHUNK_SIZE - 1)).step_by(CONTENT_CHUNK_SIZE)
    {
        let chunk: String = chars[chunk_start..chunk_start + CONTENT_CHUNK_SIZE]
            .iter()
            .collect();
        let mut hasher = DefaultHasher::new();
        chunk.hash(&mut hasher);
        chunk_entries.push((hasher.finish(), byte_offset));
        byte_offset += chunk.len();
    }

    // Group by hash and check distance constraint.
    let mut seen: std::collections::HashMap<u64, Vec<usize>> = std::collections::HashMap::new();
    for (h, offset) in &chunk_entries {
        seen.entry(*h).or_default().push(*offset);
    }

    for offsets in seen.values() {
        if offsets.len() >= CONTENT_LOOP_CHUNK_THRESHOLD {
            // Check if any window of CONTENT_LOOP_CHUNK_THRESHOLD matches
            // fits within CONTENT_LOOP_DISTANCE chars.
            for window in offsets.windows(CONTENT_LOOP_CHUNK_THRESHOLD) {
                let span = window[CONTENT_LOOP_CHUNK_THRESHOLD - 1] - window[0];
                if span <= CONTENT_LOOP_DISTANCE {
                    return true;
                }
            }
        }
    }

    false
}

/// Hash a tool call (name + args) for loop detection.
fn hash_tool_call(name: &str, args: &serde_json::Value) -> u64 {
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    // Normalize args to string for consistent hashing
    args.to_string().hash(&mut hasher);
    hasher.finish()
}

/// Build an assistant Message that includes both text and tool_use blocks.
fn build_assistant_message(text: &str, tool_calls: &[ToolCallResponse]) -> Message {
    if tool_calls.is_empty() {
        return Message::text("assistant", text);
    }

    let mut blocks = Vec::new();
    if !text.is_empty() {
        blocks.push(ContentBlock::Text {
            text: text.to_string(),
        });
    }
    for tc in tool_calls {
        blocks.push(ContentBlock::ToolUse {
            id: tc.id.clone(),
            name: tc.name.clone(),
            input: tc.arguments.clone(),
        });
    }
    Message::blocks("assistant", blocks)
}

/// Convert a ToolCallResponse (from native API) to the legacy ToolCall
/// struct used by tools::execute_tool.
fn tool_call_to_legacy(tc: &ToolCallResponse) -> ToolCall {
    ToolCall {
        name: tc.name.clone(),
        args: value_to_legacy_args(&tc.arguments),
    }
}

/// Phase 10: convert a JSON args object into the flat HashMap<String, String>
/// shape that `tools::execute_tool_with_opts` expects. Strings pass through
/// verbatim; non-strings are JSON-stringified to preserve fidelity. Used by
/// both the original `tool_call_to_legacy` and the BeforeToolUse hook
/// transformer path that may rewrite args.
fn value_to_legacy_args(args: &serde_json::Value) -> std::collections::HashMap<String, String> {
    let mut out = std::collections::HashMap::new();
    if let Some(obj) = args.as_object() {
        for (k, v) in obj {
            out.insert(
                k.clone(),
                match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                },
            );
        }
    }
    out
}

/// Execute an MCP tool via the manager, returning a ToolResult.
async fn execute_mcp_tool(
    mcp_manager: &mut Option<mcp::McpManager>,
    name: &str,
    arguments: serde_json::Value,
) -> Result<tools::ToolResult> {
    match mcp_manager {
        Some(ref mut mgr) => match mgr.execute_tool(name, arguments).await {
            Ok(output) => Ok(tools::ToolResult {
                tool_name: name.to_string(),
                success: true,
                output,
            }),
            Err(e) => Ok(tools::ToolResult {
                tool_name: name.to_string(),
                success: false,
                output: format!("MCP tool error: {:#}", e),
            }),
        },
        None => Ok(tools::ToolResult {
            tool_name: name.to_string(),
            success: false,
            output: "No MCP connection available for this tool".to_string(),
        }),
    }
}

// ---------------------------------------------------------------------------
// Team tool helpers
// ---------------------------------------------------------------------------

/// Team tool names that are handled by the team manager.
const TEAM_TOOL_NAMES: &[&str] = &[
    "send_message",
    "team_task",
    "read_messages",
    "list_teammates",
];

/// Sprint B4: built-in tools considered mutating for the plan-mode gate.
/// The dispatcher refuses to run these when `permission_mode == Plan` and
/// `plan_approved == false`. MCP tools (`mcp_*`) are also treated as
/// mutating by default -- their outward effects are unknown to the gate.
const MUTATING_TOOL_NAMES: &[&str] = &[
    "write_file",
    "edit_file",
    "run_command",
    "apply_patch",
    "multiedit",
    "task",
    "batch",
    "todo_write",
];

/// True when the named tool is considered mutating for plan-mode gating.
/// MCP tools are conservatively treated as mutating; built-in read-only
/// tools and `update_plan` itself are not.
fn is_mutating_tool(name: &str) -> bool {
    MUTATING_TOOL_NAMES.contains(&name) || name.starts_with("mcp_")
}

/// Check if a tool name is a team tool.
fn is_team_tool(name: &str) -> bool {
    TEAM_TOOL_NAMES.contains(&name)
}

/// Execute a team tool, routing to the appropriate handler in teams.rs.
async fn execute_team_tool(
    team_manager: &Option<teams::TeamManager>,
    name: &str,
    args: &std::collections::HashMap<String, String>,
) -> Result<tools::ToolResult> {
    let tm = match team_manager {
        Some(tm) => tm,
        None => {
            return Ok(tools::ToolResult {
                tool_name: name.to_string(),
                success: false,
                output: "Team mode is not enabled. Use --team flag or AGI_TEAM=1.".to_string(),
            });
        }
    };

    match name {
        "send_message" => teams::execute_send_message(tm, args).await,
        "team_task" => teams::execute_team_task(tm, args).await,
        "read_messages" => teams::execute_read_messages(tm, args).await,
        "list_teammates" => teams::execute_list_teammates(tm).await,
        _ => Ok(tools::ToolResult {
            tool_name: name.to_string(),
            success: false,
            output: format!("Unknown team tool: {}", name),
        }),
    }
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/// Assemble the full system prompt the way `AgentSession::new` does — loading
/// memory, instructions, skills, and rules from disk — but with no
/// side-effects (no shell_snapshot capture, no session-id allocation). Used by
/// `--dump-system-prompt` and any tooling that wants to inspect what the model
/// will see without instantiating a session.
pub fn assemble_system_prompt(
    sys_context: &SystemContext,
    custom_system_prompt: Option<&str>,
) -> String {
    // Load project instruction files (AGENTS.md, CLAUDE.md, etc.)
    let instructions = std::env::current_dir()
        .ok()
        .and_then(|cwd| compaction::load_instructions(&cwd));

    // Load hierarchical memory (global -> project -> local)
    let memory_context = std::env::current_dir()
        .ok()
        .map(|cwd| {
            let mgr = MemoryManager::new(&cwd);
            mgr.get_context_prompt()
        })
        .unwrap_or_default();

    // Load persistent memory from the memory pipeline
    let persistent_memory = crate::config::CliConfig::config_dir()
        .ok()
        .map(|home| crate::memory_pipeline::MemoryPipeline::load_persistent_memory(&home))
        .unwrap_or_default();

    // Discover and format skills for system prompt injection
    let discovered = skills::discover_skills();
    let skill_refs: Vec<&skills::Skill> = discovered.iter().collect();
    let skills_content = skills::format_skills_for_prompt(&skill_refs);

    // Load glob-matched rules (.agiworkforce/rules/*.md) — always-active subset
    let rules = std::env::current_dir()
        .ok()
        .map(|cwd| memory::load_rules(&cwd))
        .unwrap_or_default();
    let rules_context = if rules.is_empty() {
        String::new()
    } else {
        memory::rules_context_prompt(&rules, &[])
    };

    // Combine memory context with persistent memory from the pipeline
    let combined_memory = if persistent_memory.is_empty() {
        memory_context
    } else {
        format!("{}\n{}", memory_context, persistent_memory)
    };

    build_system_prompt(
        sys_context,
        custom_system_prompt,
        instructions.as_deref(),
        &skills_content,
        &combined_memory,
        &rules_context,
    )
}

fn build_system_prompt(
    sys_context: &SystemContext,
    custom_system_prompt: Option<&str>,
    instructions: Option<&str>,
    skills_content: &str,
    memory_context: &str,
    rules_context: &str,
) -> String {
    // Cache-friendly ordering: STABLE content first (base instructions, memory,
    // project instructions, rules, skills), VOLATILE content (cwd, git status,
    // OS, shell, current time) wrapped in `<environment>` last. The Anthropic
    // prompt cache (Phase 5) marks the boundary just before `<environment>`,
    // so re-running the agent in the same project hits the cache for
    // everything above and only re-evaluates the env block.
    let base = custom_system_prompt.unwrap_or(
        "You are AGI Workforce CLI, a powerful AI assistant running in the user's terminal.\n\
         You help users with coding, system administration, writing, analysis, and general tasks.\n\
         \n\
         You are direct, concise, and precise. When showing code, use fenced code blocks with the language specified.",
    );

    // Phase E (W2-W6): compute deferred tool names so we can inject a one-line
    // hint telling the model which tools need to be loaded via tool_search.
    let deferred_names: Vec<String> = crate::runtime::tool_catalog::all_builtin_tool_definitions()
        .into_iter()
        .filter(|t| t.should_defer)
        .map(|t| t.name)
        .collect();

    let mut prompt = String::with_capacity(2048);
    prompt.push_str(base);
    prompt.push_str(
        "\n\nImportant guidelines:\n\
         - Be concise. Terminal users prefer short, actionable answers.\n\
         - When asked to modify files or run commands, explain briefly what you'll do first.\n\
         - If a task is ambiguous, ask a clarifying question.\n\
         - Format output for terminal readability (not web).\n\
         - You have access to tools for reading/writing files, running commands, and searching. Use them when needed.\n",
    );

    // Phase E: deferred-tool hint. Only injected when there are deferred tools
    // (always true in normal mode; absent in plan mode where tool_catalog
    // returns the read-only subset directly).
    if !deferred_names.is_empty() {
        prompt.push_str(&format!(
            "- Additional tools available on demand (call `tool_search` to load their schemas): {}.\n",
            deferred_names.join(", ")
        ));
    }

    // Hierarchical memory (global -> project -> local) — stable across the session.
    if !memory_context.is_empty() {
        prompt.push('\n');
        prompt.push_str(memory_context);
        prompt.push('\n');
    }

    // Project instructions — stable across the session.
    if let Some(instr) = instructions {
        prompt.push_str("\n<project-instructions>\n");
        prompt.push_str(instr);
        prompt.push_str("\n</project-instructions>\n");
    }

    // Glob-matched rules (.agiworkforce/rules/*.md) — stable. Rules have higher
    // specificity than instructions because they're applied after.
    if !rules_context.is_empty() {
        prompt.push('\n');
        prompt.push_str(rules_context);
        prompt.push('\n');
    }

    // Skills — stable.
    if !skills_content.is_empty() {
        prompt.push('\n');
        prompt.push_str(skills_content);
        prompt.push('\n');
    }

    // VOLATILE: environment block (cwd, git status, OS, shell). Goes LAST
    // because it changes per-invocation; everything above is cacheable.
    // SystemContext's Display impl already wraps the body in <environment>
    // tags, so we just append it directly.
    prompt.push('\n');
    prompt.push_str(&sys_context.to_string());
    prompt.push('\n');

    prompt
}

// ---------------------------------------------------------------------------
// Tool call struct (kept for tools.rs compatibility)
// ---------------------------------------------------------------------------

/// Represents a tool invocation for execution by tools.rs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub args: std::collections::HashMap<String, String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::MessageContent;

    #[test]
    fn test_build_tool_definitions_count() {
        let defs = build_tool_definitions();
        // Phase E (W2-W6): 11 always-loaded + 9 deferred = 20 originals.
        // M18 (v1.2 wave 1): +11 task/team/cron tools = 31.
        //   Tasks (6): task_create, task_get, task_list, task_update, task_stop, task_output
        //   Teams (2): team_create, team_delete
        //   Cron (3):  cron_create, cron_delete, cron_list
        // M24 (v1.2 wave 1): +1 advisor tool = 32.
        // M36 follow-up: +3 LSP tools (lsp_completion, lsp_document_symbols, lsp_format) = 41.
        assert_eq!(defs.len(), 41);
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
        let tc = ToolCallResponse {
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
        let tc = ToolCallResponse {
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
        let tcs = vec![ToolCallResponse {
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
        // Text shorter than 2 * CONTENT_CHUNK_SIZE should never trigger
        let text = "short";
        assert!(!detect_content_loop(text));
    }

    #[test]
    fn test_detect_content_loop_repeated_content() {
        // Build a string with the same 50-char chunk repeated many times
        let chunk = "A".repeat(CONTENT_CHUNK_SIZE);
        let repeated = chunk.repeat(CONTENT_LOOP_CHUNK_THRESHOLD + 5);
        assert!(detect_content_loop(&repeated));
    }

    #[test]
    fn test_detect_content_loop_code_blocks_skipped() {
        // Repeated content inside a code block should NOT trigger
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

        // start_line and end_line should NOT be required
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

        // Add a message and save checkpoint
        session.messages.push(Message::text("user", "Hello"));
        session.save_checkpoint();
        assert_eq!(session.checkpoint_count(), 1);

        // Add another message
        session.messages.push(Message::text("assistant", "Hi"));
        let msg_count_before = session.messages.len();

        // Restore should go back
        assert!(session.restore_checkpoint());
        assert!(session.messages.len() < msg_count_before);
        assert_eq!(session.checkpoint_count(), 0);

        // No more checkpoints
        assert!(!session.restore_checkpoint());
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
}
