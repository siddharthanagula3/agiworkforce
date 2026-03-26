use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

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
use crate::models::{
    self, ContentBlock, Message, Provider, StreamCallback, ToolCallResponse, ToolDefinition,
};
use crate::skills;
use crate::subagent;
use crate::teams;
use crate::tools;

// ---------------------------------------------------------------------------
// Tool definitions (native API JSON Schema)
// ---------------------------------------------------------------------------

/// Build native API tool definitions with JSON Schema for each tool.
fn build_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "read_file".to_string(),
            description: "Read the contents of a file at the given path. Optionally read a specific line range.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the file to read"
                    },
                    "start_line": {
                        "type": "integer",
                        "description": "First line to read (1-based, inclusive). Omit to start from beginning."
                    },
                    "end_line": {
                        "type": "integer",
                        "description": "Last line to read (1-based, inclusive). Omit to read to the end."
                    }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "write_file".to_string(),
            description: "Write content to a file, creating it if it doesn't exist or overwriting if it does.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the file to write"
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write to the file"
                    }
                },
                "required": ["path", "content"]
            }),
        },
        ToolDefinition {
            name: "run_command".to_string(),
            description: "Execute a shell command and return stdout/stderr. Use for system commands, builds, tests, git operations, etc.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to execute"
                    }
                },
                "required": ["command"]
            }),
        },
        ToolDefinition {
            name: "search_files".to_string(),
            description: "Search for a regex pattern across files in a directory (like grep -rn).".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Regex pattern to search for"
                    },
                    "path": {
                        "type": "string",
                        "description": "Directory to search in (defaults to current directory)"
                    }
                },
                "required": ["pattern"]
            }),
        },
        ToolDefinition {
            name: "list_directory".to_string(),
            description: "List contents of a directory with file types and sizes.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Directory path to list (defaults to current directory)"
                    }
                },
                "required": []
            }),
        },
        ToolDefinition {
            name: "edit_file".to_string(),
            description: "Apply a targeted edit to a file by replacing an exact string match with new content.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the file to edit"
                    },
                    "old_string": {
                        "type": "string",
                        "description": "Exact string to find (must be unique in the file)"
                    },
                    "new_string": {
                        "type": "string",
                        "description": "Replacement string"
                    }
                },
                "required": ["path", "old_string", "new_string"]
            }),
        },
        ToolDefinition {
            name: "web_search".to_string(),
            description: "Search the web for information.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query string"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results to return (default 5)"
                    }
                },
                "required": ["query"]
            }),
        },
        ToolDefinition {
            name: "web_fetch".to_string(),
            description: "Fetch and extract text content from a URL.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "URL to fetch content from"
                    }
                },
                "required": ["url"]
            }),
        },
        ToolDefinition {
            name: "task".to_string(),
            description: "Spawn a subagent to handle a focused task in parallel. \
                          The subagent has access to all the same tools (read, write, edit, \
                          run commands, search) and runs concurrently. Use this to parallelize \
                          independent work items — e.g., fixing multiple files, running \
                          separate investigations, or implementing independent features. \
                          Each task runs to completion and returns its result.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "description": {
                        "type": "string",
                        "description": "Short description of the task (shown in status output)"
                    },
                    "prompt": {
                        "type": "string",
                        "description": "The full prompt/instructions for the subagent"
                    }
                },
                "required": ["description", "prompt"]
            }),
        },
        // --- Codex CLI parity tools ---
        ToolDefinition {
            name: "apply_patch".to_string(),
            description: "Apply a unified diff/patch to the working directory.".to_string(),
            input_schema: serde_json::json!({"type":"object","properties":{"patch":{"type":"string","description":"Unified diff content"}},"required":["patch"]}),
        },
        ToolDefinition {
            name: "grep_files".to_string(),
            description: "Search for a regex pattern across files using ripgrep. Supports glob filtering.".to_string(),
            input_schema: serde_json::json!({"type":"object","properties":{"pattern":{"type":"string","description":"Regex pattern"},"path":{"type":"string","description":"Directory (default .)"},"include":{"type":"string","description":"Glob filter e.g. *.rs"}},"required":["pattern"]}),
        },
        ToolDefinition {
            name: "tool_search".to_string(),
            description: "Search available tools by keyword.".to_string(),
            input_schema: serde_json::json!({"type":"object","properties":{"query":{"type":"string","description":"Search query"},"max_results":{"type":"integer","description":"Max results (default 10)"}},"required":["query"]}),
        },
    ]
}

/// Build team-specific tool definitions (only included when team mode is active).
fn build_team_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "send_message".to_string(),
            description: "Send a message to a teammate. Use this to coordinate work, \
                          share findings, request help, or notify teammates of status changes."
                .to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "from": {
                        "type": "string",
                        "description": "Your teammate name (the sender)"
                    },
                    "to": {
                        "type": "string",
                        "description": "The recipient teammate name"
                    },
                    "content": {
                        "type": "string",
                        "description": "The message content"
                    }
                },
                "required": ["from", "to", "content"]
            }),
        },
        ToolDefinition {
            name: "team_task".to_string(),
            description: "Create, update, or list shared tasks visible to all teammates. \
                          Use action 'create' to add a new task, 'update' to change status, \
                          or 'list' to see all tasks."
                .to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["create", "update", "list"],
                        "description": "The action to perform: create, update, or list"
                    },
                    "title": {
                        "type": "string",
                        "description": "Task title (required for 'create')"
                    },
                    "assignee": {
                        "type": "string",
                        "description": "Teammate name to assign the task to (optional, for 'create')"
                    },
                    "dependencies": {
                        "type": "string",
                        "description": "Comma-separated task IDs this task depends on (optional, for 'create')"
                    },
                    "task_id": {
                        "type": "string",
                        "description": "Task ID to update (required for 'update')"
                    },
                    "status": {
                        "type": "string",
                        "enum": ["pending", "in_progress", "completed", "blocked"],
                        "description": "New status (required for 'update')"
                    }
                },
                "required": ["action"]
            }),
        },
        ToolDefinition {
            name: "read_messages".to_string(),
            description: "Read pending messages for a teammate. Messages are consumed \
                          after reading (inbox is drained)."
                .to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "The teammate name whose inbox to read"
                    }
                },
                "required": ["name"]
            }),
        },
        ToolDefinition {
            name: "list_teammates".to_string(),
            description: "List all registered teammates and their current status.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
    ]
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

/// Tracks the state of an agent conversation session.
#[derive(Debug)]
pub struct AgentSession {
    pub messages: Vec<Message>,
    pub model: String,
    pub provider: Provider,
    pub total_input_tokens: u32,
    pub total_output_tokens: u32,
    pub turn_count: u32,
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
}

/// Metadata returned after a single agent turn.
pub struct TurnResult {
    pub response: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
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
            turn_count: 0,
            recent_tool_calls: Vec::new(),
            loop_strike_count: 0,
            hooks_config,
            mcp_manager: None,
            max_turns: None,
            plan_mode: false,
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
        let tool_names: Vec<String> = build_tool_definitions()
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

    /// Clear the conversation history (keeps system prompt).
    pub fn clear(&mut self) {
        self.messages.truncate(1); // keep system prompt
        self.turn_count = 0;
        self.recent_tool_calls.clear();
        self.loop_strike_count = 0;
    }

    /// Normalize conversation history: ensure every tool_use call has a
    /// matching tool_result. Orphaned calls (e.g., from interrupted turns)
    /// get synthetic "aborted" results so the LLM API doesn't reject the
    /// malformed history.
    ///
    /// Pattern from Codex CLI's `context_manager/normalize.rs`.
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
        self.mcp_manager.as_ref().map(|m| m.tools()).filter(|t| !t.is_empty())
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
        } else if usage.near_limit {
            eprintln!(
                "  {}",
                format!("Warning: {}", compaction::format_context_report(&usage)).yellow()
            );
        }

        // Add user message
        self.messages.push(Message::text("user", user_input));

        // Save checkpoint for /rewind
        self.save_checkpoint();

        let max_tokens = config.default.max_tokens;

        // Merge built-in tool definitions with MCP tools
        let mut tool_defs = build_tool_definitions();
        // In plan mode, only allow read-only tools
        if self.plan_mode {
            let read_only = [
                "read_file",
                "search_files",
                "list_directory",
                "web_search",
                "web_fetch",
            ];
            tool_defs.retain(|t| read_only.contains(&t.name.as_str()));
        }
        // Add team tools when team mode is active
        if self.team_manager.is_some() {
            tool_defs.extend(build_team_tool_definitions());
        }
        if let Some(ref mcp) = self.mcp_manager {
            tool_defs.extend(mcp.tool_definitions());
        }

        // --- First LLM call (with user's streaming callback) ---
        let result = match models::stream_completion(
            config,
            &self.provider,
            &self.model,
            &self.messages,
            max_tokens,
            Some(&tool_defs),
            on_chunk,
        )
        .await
        {
            Ok(r) => r,
            Err(e) => {
                // Retry once if the error is retryable
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

        // Build the assistant message with both text and tool_use blocks
        let assistant_msg = build_assistant_message(&result.text, &result.tool_calls);
        self.messages.push(assistant_msg);

        let mut total_input = result.input_tokens;
        let mut total_output = result.output_tokens;
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

            // Partition tool calls: task tools run concurrently, others sequentially
            let (task_calls, other_calls): (Vec<_>, Vec<_>) =
                current_tool_calls.iter().partition(|tc| tc.name == "task");

            // Spawn all task tool calls concurrently via subagent manager
            let mut task_spawn_results = Vec::new();
            for tc in &task_calls {
                hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::BeforeToolUse,
                    &hooks::HookInput {
                        event: "BeforeToolUse".to_string(),
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

                let mgr = self.subagent_manager.as_ref().unwrap();
                let id_result = mgr.spawn(&description, &prompt).await;
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
                    hooks::HookEvent::AfterToolUse,
                    &hooks::HookInput {
                        event: "AfterToolUse".to_string(),
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

            // Execute non-task tool calls sequentially (as before)
            for tc in &other_calls {
                hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::BeforeToolUse,
                    &hooks::HookInput {
                        event: "BeforeToolUse".to_string(),
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

                // Route: team tools -> MCP tools (mcp_*) -> built-in tools
                let legacy = tool_call_to_legacy(tc);
                let tool_result = if is_team_tool(&tc.name) {
                    execute_team_tool(&self.team_manager, &tc.name, &legacy.args).await?
                } else if tc.name.starts_with("mcp_") {
                    execute_mcp_tool(&mut self.mcp_manager, &tc.name, tc.arguments.clone()).await?
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

                hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::AfterToolUse,
                    &hooks::HookInput {
                        event: "AfterToolUse".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
                        tool_name: Some(tc.name.clone()),
                        tool_args: Some(tc.arguments.clone()),
                        tool_output: Some(tool_result.output.clone()),
                        message: None,
                        tool_execution: None,
                    },
                )
                .await;

                result_blocks.push(ContentBlock::ToolResult {
                    tool_use_id: tc.id.clone(),
                    content: tool_result.output,
                    is_error: !tool_result.success,
                });
            }

            // Send tool results as a structured user message
            self.messages.push(Message::blocks("user", result_blocks));

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
        self.turn_count += 1;

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
                let session_id = self
                    .session_name
                    .as_deref()
                    .unwrap_or("anonymous");
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
                    if let Err(e) =
                        crate::memory_pipeline::MemoryPipeline::consolidate(&home_clone, &config_clone).await
                    {
                        eprintln!("[memory_pipeline] consolidation error: {}", e);
                    }
                });
            }
        }

        Ok(TurnResult {
            response: final_response,
            input_tokens: total_input,
            output_tokens: total_output,
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
    let mut args = std::collections::HashMap::new();
    if let Some(obj) = tc.arguments.as_object() {
        for (k, v) in obj {
            args.insert(
                k.clone(),
                match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                },
            );
        }
    }
    ToolCall {
        name: tc.name.clone(),
        args,
    }
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

fn build_system_prompt(
    sys_context: &SystemContext,
    custom_system_prompt: Option<&str>,
    instructions: Option<&str>,
    skills_content: &str,
    memory_context: &str,
    rules_context: &str,
) -> String {
    let base = custom_system_prompt.unwrap_or(
        "You are AGI Workforce CLI, a powerful AI assistant running in the user's terminal.\n\
         You help users with coding, system administration, writing, analysis, and general tasks.\n\
         \n\
         You are direct, concise, and precise. When showing code, use fenced code blocks with the language specified.",
    );

    let mut prompt = format!(
        r#"{}

{}

Important guidelines:
- Be concise. Terminal users prefer short, actionable answers.
- When asked to modify files or run commands, explain briefly what you'll do first.
- If a task is ambiguous, ask a clarifying question.
- Format output for terminal readability (not web).
- You have access to tools for reading/writing files, running commands, and searching. Use them when needed.
"#,
        base, sys_context
    );

    // Hierarchical memory (global -> project -> local) — injected before
    // project instructions so instructions can override memory defaults.
    if !memory_context.is_empty() {
        prompt.push('\n');
        prompt.push_str(memory_context);
        prompt.push('\n');
    }

    if let Some(instr) = instructions {
        prompt.push_str("\n<project-instructions>\n");
        prompt.push_str(instr);
        prompt.push_str("\n</project-instructions>\n");
    }

    // Glob-matched rules (.agiworkforce/rules/*.md) — injected after
    // instructions so rules have highest specificity.
    if !rules_context.is_empty() {
        prompt.push('\n');
        prompt.push_str(rules_context);
        prompt.push('\n');
    }

    if !skills_content.is_empty() {
        prompt.push('\n');
        prompt.push_str(skills_content);
    }

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
        // 8 base tools + 1 task tool + 3 parity tools (apply_patch, grep_files, tool_search) = 12
        assert_eq!(defs.len(), 12);
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
