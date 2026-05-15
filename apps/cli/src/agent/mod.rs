use std::path::PathBuf;

use anyhow::Result;

use crate::compaction;
use crate::config::CliConfig;
use crate::context::SystemContext;
use crate::hooks;
use crate::mcp;
use crate::memory::{self, MemoryManager};
#[cfg(test)]
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

    /// Generate an A2A AgentCard representing this session's capabilities.
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

    /// Override the provider from config.
    pub fn set_provider_override(&mut self, provider_name: &str) {
        if let Some(p) = models::provider_from_name(provider_name) {
            self.provider = p;
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
        self.managed_session
            .as_ref()
            .map(|s| s.session_id.as_str())
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::MessageContent;

    use executor::{
        detect_content_loop, hash_tool_call, tool_call_to_legacy, CONTENT_CHUNK_SIZE,
        CONTENT_LOOP_CHUNK_THRESHOLD, LOOP_DETECTION_THRESHOLD,
    };
    use history::build_assistant_message;
    use tools::is_team_tool;
    use crate::models::ContentBlock;

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
