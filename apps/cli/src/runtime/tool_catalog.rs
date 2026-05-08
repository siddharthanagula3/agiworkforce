use std::collections::HashSet;

use crate::models::ToolDefinition;

/// Builder helper: only the API-visible fields are required; Phase 6 / Phase 8
/// metadata defaults to safe values (not read-only, not concurrency-safe, no
/// per-tool size override). Read-only tools should call `.read_only()`.
fn def(name: &str, description: &str, input_schema: serde_json::Value) -> ToolDefinition {
    ToolDefinition {
        name: name.to_string(),
        description: description.to_string(),
        input_schema,
        is_read_only: false,
        is_concurrency_safe: false,
        max_result_size_chars: None,
        should_defer: false,
    }
}

impl ToolDefinition {
    /// Mark a tool as read-only and concurrency-safe (Phase 6). Read-only
    /// tools never mutate filesystem / network state and can run in parallel.
    fn read_only(mut self) -> Self {
        self.is_read_only = true;
        self.is_concurrency_safe = true;
        self
    }

    /// Override the per-tool result size cap in chars (Phase 8). None falls
    /// back to the global `MAX_OUTPUT_BYTES`.
    fn with_size_cap(mut self, max_chars: usize) -> Self {
        self.max_result_size_chars = Some(max_chars);
        self
    }

    /// Phase E (W2-W6): mark this tool as deferred — excluded from the
    /// model's initial schema list. The model loads it on demand via
    /// `tool_search`. Always read-only too (deferred tools are niche and
    /// never need mutation permissions before they're loaded).
    fn deferred(mut self) -> Self {
        self.should_defer = true;
        self
    }
}

/// Build native API tool definitions with JSON Schema for each built-in tool.
pub fn built_in_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        def(
            "read_file",
            "Read the contents of a file at the given path. Optionally read a specific line range.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path to the file to read"},
                    "start_line": {"type": "integer", "description": "First line to read (1-based, inclusive). Omit to start from beginning."},
                    "end_line": {"type": "integer", "description": "Last line to read (1-based, inclusive). Omit to read to the end."}
                },
                "required": ["path"]
            }),
        ).read_only().with_size_cap(100_000),
        def(
            "write_file",
            "Write content to a file, creating it if it doesn't exist or overwriting if it does.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path to the file to write"},
                    "content": {"type": "string", "description": "Content to write to the file"}
                },
                "required": ["path", "content"]
            }),
        ).with_size_cap(5_000),
        def(
            "run_command",
            "Execute a shell command and return stdout/stderr. Use for system commands, builds, tests, git operations, etc.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The shell command to execute"}
                },
                "required": ["command"]
            }),
        ).with_size_cap(50_000),
        def(
            "search_files",
            "Search for a regex pattern across files in a directory (like grep -rn).",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Regex pattern to search for"},
                    "path": {"type": "string", "description": "Directory to search in (defaults to current directory)"}
                },
                "required": ["pattern"]
            }),
        ).read_only().with_size_cap(50_000),
        def(
            "list_directory",
            "List contents of a directory with file types and sizes.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Directory path to list (defaults to current directory)"}
                },
                "required": []
            }),
        ).read_only().with_size_cap(20_000),
        def(
            "edit_file",
            "Apply a targeted edit to a file by replacing an exact string match with new content.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path to the file to edit"},
                    "old_string": {"type": "string", "description": "Exact string to find (must be unique in the file)"},
                    "new_string": {"type": "string", "description": "Replacement string"}
                },
                "required": ["path", "old_string", "new_string"]
            }),
        ).with_size_cap(5_000),
        def(
            "web_search",
            "Search the web for information.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query string"},
                    "max_results": {"type": "integer", "description": "Maximum number of results to return (default 5)"}
                },
                "required": ["query"]
            }),
        ).read_only().with_size_cap(100_000),
        def(
            "web_fetch",
            "Fetch and extract text content from a URL.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL to fetch content from"}
                },
                "required": ["url"]
            }),
        ).read_only().with_size_cap(200_000),
        def(
            "task",
            "Spawn a subagent to handle a focused task in parallel. \
             The subagent has access to all the same tools (read, write, edit, \
             run commands, search) and runs concurrently. Use this to parallelize \
             independent work items — e.g., fixing multiple files, running \
             separate investigations, or implementing independent features. \
             Each task runs to completion and returns its result.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "description": {"type": "string", "description": "Short description of the task (shown in status output)"},
                    "prompt": {"type": "string", "description": "The full prompt/instructions for the subagent"}
                },
                "required": ["description", "prompt"]
            }),
        ),
        // --- Extended tool set ---
        def(
            "grep_files",
            "Search for a regex pattern across files using ripgrep. Supports glob filtering.",
            serde_json::json!({"type":"object","properties":{"pattern":{"type":"string","description":"Regex pattern"},"path":{"type":"string","description":"Directory (default .)"},"include":{"type":"string","description":"Glob filter e.g. *.rs"}},"required":["pattern"]}),
        ).read_only().with_size_cap(50_000),
        // Phase E: tool_search is always-loaded — it is the on-demand schema
        // loader. The model calls this to get the JSON schema for any deferred
        // tool before using it.
        def(
            "tool_search",
            "Search available tools by keyword or load specific tool schemas on demand. \
             Use query `select:tool1,tool2` to fetch exact schemas, or a keyword like \
             `\"patch\"` to fuzzy-search. Returns JSON schemas the model can call immediately.",
            serde_json::json!({"type":"object","properties":{"query":{"type":"string","description":"Search query or `select:tool1,tool2` to load specific schemas"},"max_results":{"type":"integer","description":"Max results (default 10)"}},"required":["query"]}),
        ).read_only().with_size_cap(20_000),
        // -----------------------------------------------------------------------
        // Deferred tools (Phase E, W2-W6): excluded from initial schema list.
        // The model must call tool_search to load these schemas on demand.
        // -----------------------------------------------------------------------
        def(
            "apply_patch",
            "Apply a unified diff/patch to the working directory.",
            serde_json::json!({"type":"object","properties":{"patch":{"type":"string","description":"Unified diff content"}},"required":["patch"]}),
        ).with_size_cap(5_000).deferred(),
        // Sprint B4: real plan mode -- model writes plan via this tool, user
        // approves via /plan accept, then mutating tools unlock. Deferred
        // because it is plan-mode-only; normal sessions don't need it in the
        // initial schema list.
        def(
            "update_plan",
            "Write or revise the execution plan. REQUIRED in plan mode before any mutating tool call (bash, edit_file, write_file, apply_patch, MCP tools). Each step is one discrete action. After calling, await user approval -- do NOT call mutating tools yet. The user reviews the plan and types `/plan accept`.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "steps": {
                        "type": "array",
                        "description": "Ordered list of plan steps.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "description": {"type": "string", "description": "What this step does."},
                                "status": {"type": "string", "enum": ["pending", "in_progress", "complete"], "description": "Step status; defaults to pending."},
                                "notes": {"type": "string", "description": "Optional notes about the step."}
                            },
                            "required": ["description"]
                        }
                    }
                },
                "required": ["steps"]
            }),
        ).with_size_cap(2_000).deferred(),
        def(
            "glob",
            "Find files by glob pattern (e.g. `**/*.rs`). Returns matching file paths.",
            serde_json::json!({"type":"object","properties":{"pattern":{"type":"string","description":"Glob pattern"},"path":{"type":"string","description":"Base directory (default .)"}},"required":["pattern"]}),
        ).read_only().with_size_cap(20_000).deferred(),
        def(
            "batch",
            "Execute multiple tool calls in parallel. Pass an array of tool call objects.",
            serde_json::json!({"type":"object","properties":{"calls":{"type":"array","description":"Array of tool call objects with `name` and `args` fields","items":{"type":"object"}}},"required":["calls"]}),
        ).with_size_cap(50_000).deferred(),
        def(
            "multiedit",
            "Apply multiple targeted edits to a single file atomically.",
            serde_json::json!({"type":"object","properties":{"path":{"type":"string","description":"Absolute path to the file"},"edits":{"type":"array","description":"Array of {old_string, new_string} objects","items":{"type":"object","properties":{"old_string":{"type":"string"},"new_string":{"type":"string"}},"required":["old_string","new_string"]}}},"required":["path","edits"]}),
        ).with_size_cap(5_000).deferred(),
        def(
            "todo_read",
            "Read the current TODO list for this session.",
            serde_json::json!({"type":"object","properties":{},"required":[]}),
        ).read_only().with_size_cap(10_000).deferred(),
        def(
            "todo_write",
            "Write or update the TODO list for this session.",
            serde_json::json!({"type":"object","properties":{"todos":{"type":"array","description":"Array of todo item strings","items":{"type":"string"}}},"required":["todos"]}),
        ).with_size_cap(2_000).deferred(),
        def(
            "ask_user",
            "Ask the user a clarifying question and wait for their response.",
            serde_json::json!({"type":"object","properties":{"question":{"type":"string","description":"The question to ask the user"}},"required":["question"]}),
        ).with_size_cap(2_000).deferred(),
        def(
            "read_many_files",
            "Read multiple files at once. Returns concatenated contents with file boundaries.",
            serde_json::json!({"type":"object","properties":{"paths":{"type":"array","description":"Array of absolute file paths to read","items":{"type":"string"}}},"required":["paths"]}),
        ).read_only().with_size_cap(200_000).deferred(),
    ]
}

/// Build team-specific tool definitions (only included when team mode is active).
pub fn team_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        def(
            "send_message",
            "Send a message to a teammate. Use this to coordinate work, share findings, request help, or notify teammates of status changes.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "from": {"type": "string", "description": "Your teammate name (the sender)"},
                    "to": {"type": "string", "description": "The recipient teammate name"},
                    "content": {"type": "string", "description": "The message content"}
                },
                "required": ["from", "to", "content"]
            }),
        ),
        def(
            "team_task",
            "Create, update, or list shared tasks visible to all teammates. Use action 'create' to add a new task, 'update' to change status, or 'list' to see all tasks.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["create", "update", "list"], "description": "The action to perform: create, update, or list"},
                    "title": {"type": "string", "description": "Task title (required for 'create')"},
                    "assignee": {"type": "string", "description": "Teammate name to assign the task to (optional, for 'create')"},
                    "dependencies": {"type": "string", "description": "Comma-separated task IDs this task depends on (optional, for 'create')"},
                    "task_id": {"type": "string", "description": "Task ID to update (required for 'update')"},
                    "status": {"type": "string", "enum": ["pending", "in_progress", "completed", "blocked"], "description": "New status (required for 'update')"}
                },
                "required": ["action"]
            }),
        ),
        def(
            "read_messages",
            "Read pending messages for a teammate. Messages are consumed after reading (inbox is drained).",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "The teammate name whose inbox to read"}
                },
                "required": ["name"]
            }),
        ),
        def(
            "list_teammates",
            "List all registered teammates and their current status.",
            serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        ).read_only(),
    ]
}

/// Return all built-in tool definitions whose schema the model sees in the
/// initial system-prompt tool list (i.e. `should_defer == false`). These are
/// the ~11 core tools. Niche tools (apply_patch, update_plan, glob, batch,
/// multiedit, todo_*, ask_user, read_many_files) are deferred and loaded on
/// demand via the `tool_search` tool.
///
/// Phase E (W2-W6): deferred-tool pattern translated from Claude Code's
/// `ToolSearchTool.ts` / `shouldDefer` mechanism.
pub fn always_loaded_tool_definitions() -> Vec<ToolDefinition> {
    built_in_tool_definitions()
        .into_iter()
        .filter(|t| !t.should_defer)
        .collect()
}

/// Return all built-in tool definitions regardless of `should_defer`. Used by
/// `tool_search` to answer on-demand schema requests, and by the plan-mode
/// filter which needs to inspect the full set.
pub fn all_builtin_tool_definitions() -> Vec<ToolDefinition> {
    built_in_tool_definitions()
}

/// Assemble the effective tool definitions for a session.
///
/// Behavior:
/// - built-in tools: always-loaded set (should_defer=false). In plan mode,
///   filtered to read-only only; `update_plan` is force-included even though
///   it is normally deferred.
/// - team tools are appended when team mode is enabled
/// - MCP tools are appended last when present
/// - `allowed_tools`, when provided, filters the final tool list by name
///
/// Phase E: deferred tools are excluded from the initial schema list here.
/// They remain executable; the model loads their schema via `tool_search`.
pub fn effective_tool_definitions(
    plan_mode: bool,
    team_mode: bool,
    allowed_tools: Option<&[String]>,
    mcp_tool_definitions: Option<&[ToolDefinition]>,
) -> Vec<ToolDefinition> {
    let mut tool_definitions = if plan_mode {
        filter_read_only_builtin_tool_definitions()
    } else {
        // Phase E: only send non-deferred tools in the initial schema list.
        // The model calls tool_search to load deferred schemas on demand.
        always_loaded_tool_definitions()
    };

    if team_mode {
        tool_definitions.extend(team_tool_definitions());
    }

    if let Some(mcp_tool_definitions) = mcp_tool_definitions {
        tool_definitions.extend(mcp_tool_definitions.iter().cloned());
    }

    if let Some(allowed_tools) = allowed_tools {
        let allowed_tool_names = allowed_tools
            .iter()
            .map(String::as_str)
            .collect::<HashSet<_>>();
        tool_definitions
            .retain(|tool_definition| allowed_tool_names.contains(tool_definition.name.as_str()));
    }

    tool_definitions
}

fn filter_read_only_builtin_tool_definitions() -> Vec<ToolDefinition> {
    let read_only_tool_names = [
        "read_file",
        "search_files",
        "list_directory",
        "web_search",
        "web_fetch",
        // Sprint B4: `update_plan` is the plan tool. Even though it is
        // normally deferred (plan-mode-only), it MUST appear in the initial
        // schema list when plan mode is active — that's the whole point.
        "update_plan",
    ];
    // Use all_builtin_tool_definitions (includes deferred) so update_plan
    // is visible here despite its should_defer=true flag.
    all_builtin_tool_definitions()
        .into_iter()
        .filter(|tool_definition| read_only_tool_names.contains(&tool_definition.name.as_str()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tool_names(tool_definitions: &[ToolDefinition]) -> Vec<&str> {
        tool_definitions
            .iter()
            .map(|tool_definition| tool_definition.name.as_str())
            .collect()
    }

    fn test_tool_definition(name: &str) -> ToolDefinition {
        ToolDefinition {
            name: name.to_string(),
            description: format!("{name} description"),
            input_schema: serde_json::json!({"type":"object"}),
            is_read_only: false,
            is_concurrency_safe: false,
            max_result_size_chars: None,
            should_defer: false,
        }
    }

    #[test]
    fn built_in_plan_mode_keeps_only_read_only_tools_and_appends_team_and_mcp() {
        let mcp_tool_definitions = vec![test_tool_definition("mcp_alpha")];

        let tool_definitions =
            effective_tool_definitions(true, true, None, Some(&mcp_tool_definitions));

        assert_eq!(
            tool_names(&tool_definitions),
            vec![
                "read_file",
                "search_files",
                "list_directory",
                "web_search",
                "web_fetch",
                "update_plan",
                "send_message",
                "team_task",
                "read_messages",
                "list_teammates",
                "mcp_alpha",
            ]
        );
    }

    #[test]
    fn allowed_tools_filters_the_full_effective_list_in_original_order() {
        let mcp_tool_definitions = vec![test_tool_definition("mcp_alpha")];
        let allowed_tools = vec![
            "web_search".to_string(),
            "team_task".to_string(),
            "mcp_alpha".to_string(),
        ];

        let tool_definitions = effective_tool_definitions(
            false,
            true,
            Some(&allowed_tools),
            Some(&mcp_tool_definitions),
        );

        assert_eq!(
            tool_names(&tool_definitions),
            vec!["web_search", "team_task", "mcp_alpha"]
        );
    }

    #[test]
    fn plan_mode_applies_before_allowed_tools() {
        let allowed_tools = vec!["run_command".to_string(), "read_file".to_string()];

        let tool_definitions = effective_tool_definitions(true, false, Some(&allowed_tools), None);

        assert_eq!(tool_names(&tool_definitions), vec!["read_file"]);
    }

    /// Phase 6: every read-only tool is also concurrency-safe (Phase 7
    /// batches them in parallel). Mutating tools must be neither.
    #[test]
    fn built_in_tool_concurrency_flags_match_documentation() {
        let defs = built_in_tool_definitions();

        let read_only: Vec<&str> = defs
            .iter()
            .filter(|d| d.is_read_only)
            .map(|d| d.name.as_str())
            .collect();

        // Sorted alphabetically to make the assertion stable.
        // Phase E: glob, read_many_files, todo_read are deferred but also
        // read-only (they never mutate state).
        let mut got = read_only.clone();
        got.sort();
        assert_eq!(
            got,
            vec![
                "glob",
                "grep_files",
                "list_directory",
                "read_file",
                "read_many_files",
                "search_files",
                "todo_read",
                "tool_search",
                "web_fetch",
                "web_search",
            ]
        );

        // Every read-only tool is also concurrency-safe.
        for d in defs.iter().filter(|d| d.is_read_only) {
            assert!(
                d.is_concurrency_safe,
                "read-only tool {} must also be concurrency-safe",
                d.name
            );
        }

        // Mutating tools never claim concurrency safety.
        for d in defs.iter().filter(|d| !d.is_read_only) {
            assert!(
                !d.is_concurrency_safe,
                "mutating tool {} must not be concurrency-safe",
                d.name
            );
        }
    }

    /// Phase 8: every built-in tool either has an explicit per-tool size cap
    /// or relies on the global default. The cap is set on tools whose output
    /// can be large; confirm the documented sizes hold.
    #[test]
    fn built_in_tool_size_caps_match_documentation() {
        let defs = built_in_tool_definitions();
        let caps: std::collections::HashMap<&str, Option<usize>> = defs
            .iter()
            .map(|d| (d.name.as_str(), d.max_result_size_chars))
            .collect();

        assert_eq!(caps.get("read_file"), Some(&Some(100_000)));
        assert_eq!(caps.get("write_file"), Some(&Some(5_000)));
        assert_eq!(caps.get("run_command"), Some(&Some(50_000)));
        assert_eq!(caps.get("search_files"), Some(&Some(50_000)));
        assert_eq!(caps.get("list_directory"), Some(&Some(20_000)));
        assert_eq!(caps.get("edit_file"), Some(&Some(5_000)));
        assert_eq!(caps.get("web_search"), Some(&Some(100_000)));
        assert_eq!(caps.get("web_fetch"), Some(&Some(200_000)));
        assert_eq!(caps.get("apply_patch"), Some(&Some(5_000)));
        assert_eq!(caps.get("grep_files"), Some(&Some(50_000)));
        assert_eq!(caps.get("tool_search"), Some(&Some(20_000)));
        assert_eq!(caps.get("task"), Some(&None));
        assert_eq!(caps.get("update_plan"), Some(&Some(2_000)));
    }
}
