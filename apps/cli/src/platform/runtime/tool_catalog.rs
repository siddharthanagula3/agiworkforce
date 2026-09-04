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
        aliases: tool_aliases(name)
            .iter()
            .map(|alias| alias.to_string())
            .collect(),
        owner: tool_owner(name).to_string(),
        permission_class: "mutating".to_string(),
        diagnostic_tags: diagnostic_tags(name, "mutating"),
    }
}

/// Builder extension for the catalog. `ToolDefinition` moved into the shared
/// `agiworkforce-llm` crate (Wave 5c1), so these CLI-local builder helpers
/// live on an extension trait instead of an inherent impl.
trait ToolDefinitionCatalogExt: Sized {
    fn read_only(self) -> Self;
    fn control(self) -> Self;
    fn interactive(self) -> Self;
    fn with_size_cap(self, max_chars: usize) -> Self;
    fn deferred(self) -> Self;
}

impl ToolDefinitionCatalogExt for ToolDefinition {
    /// Mark a tool as read-only and concurrency-safe (Phase 6). Read-only
    /// tools never mutate filesystem / network state and can run in parallel.
    fn read_only(mut self) -> Self {
        self.is_read_only = true;
        self.is_concurrency_safe = true;
        self.permission_class = "read_only".to_string();
        self.diagnostic_tags = diagnostic_tags(&self.name, "read_only");
        self
    }

    /// Mark a tool as a control-plane tool. These tools change agent/session
    /// state but do not directly mutate user files or external systems.
    fn control(mut self) -> Self {
        self.permission_class = "control".to_string();
        self.diagnostic_tags = diagnostic_tags(&self.name, "control");
        self
    }

    /// Mark a tool that requires live user interaction instead of file/network
    /// mutation.
    fn interactive(mut self) -> Self {
        self.permission_class = "interactive".to_string();
        self.diagnostic_tags = diagnostic_tags(&self.name, "interactive");
        self
    }

    /// Override the per-tool result size cap in chars (Phase 8). None falls
    /// back to the global `MAX_OUTPUT_BYTES`.
    fn with_size_cap(mut self, max_chars: usize) -> Self {
        self.max_result_size_chars = Some(max_chars);
        self
    }

    /// Phase E (W2-W6): mark this tool as deferred, excluded from the
    /// model's initial schema list. The model loads it on demand via
    /// `tool_search`. Always read-only too (deferred tools are niche and
    /// never need mutation permissions before they're loaded).
    fn deferred(mut self) -> Self {
        self.should_defer = true;
        self
    }
}

/// Canonicalize reference-compatible and AGI compatibility aliases to executor names.
pub fn canonical_tool_name(tool_name: &str) -> &str {
    match tool_name {
        "Read" | "read" | "ReadFile" => "read_file",
        "Write" | "write" | "WriteFile" => "write_file",
        "Edit" | "edit" | "EditFile" => "edit_file",
        "MultiEdit" | "multi_edit" | "Multi_Edit" => "multiedit",
        "Bash" | "bash" | "Shell" | "shell" | "RunCommand" => "run_command",
        "PowerShell" => "powershell",
        "Glob" | "glob_search" | "GlobSearch" => "glob",
        "Grep" | "grep" | "GrepFiles" | "grep_search" | "GrepSearch" => "grep_files",
        "LS" | "Ls" | "ls" | "List" | "ListDirectory" => "list_directory",
        "WebFetch" => "web_fetch",
        "WebSearch" => "web_search",
        "ToolSearch" => "tool_search",
        "Skill" => "skill",
        "ApplyPatch" => "apply_patch",
        "Batch" => "batch",
        "NotebookEdit" => "notebook_edit",
        "TodoRead" => "todo_read",
        "TodoWrite" => "todo_write",
        "AskUser" | "AskUserQuestion" => "ask_user",
        "ReadManyFiles" => "read_many_files",
        "TeamCreate" => "team_create",
        "TeamDelete" => "team_delete",
        "CronCreate" => "cron_create",
        "CronDelete" => "cron_delete",
        "CronList" => "cron_list",
        "Advisor" => "advisor",
        "EnterWorktree" => "enter_worktree",
        "ExitWorktree" => "exit_worktree",
        "ListWorktrees" => "list_worktrees",
        _ => tool_name,
    }
}

pub fn tool_aliases(tool_name: &str) -> &'static [&'static str] {
    match tool_name {
        "read_file" => &["Read", "read", "ReadFile"],
        "write_file" => &["Write", "write", "WriteFile"],
        "edit_file" => &["Edit", "edit", "EditFile"],
        "multiedit" => &["MultiEdit", "multi_edit", "Multi_Edit"],
        "run_command" => &["Bash", "bash", "Shell", "shell", "RunCommand"],
        "powershell" => &["PowerShell"],
        "glob" => &["Glob", "glob_search", "GlobSearch"],
        "grep_files" => &["Grep", "grep", "GrepFiles", "grep_search", "GrepSearch"],
        "list_directory" => &["LS", "Ls", "ls", "List", "ListDirectory"],
        "web_fetch" => &["WebFetch"],
        "web_search" => &["WebSearch"],
        "tool_search" => &["ToolSearch"],
        "skill" => &["Skill"],
        "apply_patch" => &["ApplyPatch"],
        "batch" => &["Batch"],
        "notebook_edit" => &["NotebookEdit"],
        "todo_read" => &["TodoRead"],
        "todo_write" => &["TodoWrite"],
        "ask_user" => &["AskUser", "AskUserQuestion"],
        "read_many_files" => &["ReadManyFiles"],
        "team_create" => &["TeamCreate"],
        "team_delete" => &["TeamDelete"],
        "cron_create" => &["CronCreate"],
        "cron_delete" => &["CronDelete"],
        "cron_list" => &["CronList"],
        "advisor" => &["Advisor"],
        "enter_worktree" => &["EnterWorktree"],
        "exit_worktree" => &["ExitWorktree"],
        "list_worktrees" => &["ListWorktrees"],
        _ => &[],
    }
}

pub fn policy_alias_matches_tool(alias: &str, tool_name: &str) -> bool {
    if alias.eq_ignore_ascii_case(tool_name) {
        return true;
    }

    let normalized = normalize_policy_alias(alias);
    policy_alias_tool_names(normalized.as_str()).contains(&tool_name)
}

fn policy_alias_tool_names(alias: &str) -> &'static [&'static str] {
    match alias {
        "bash" | "shell" | "runcommand" => &["run_command"],
        "powershell" => &["powershell"],
        "read" | "readfile" => &["read_file", "read_many_files"],
        "readmanyfiles" => &["read_many_files"],
        "write" | "writefile" => &["write_file"],
        "edit" | "editfile" => &["edit_file", "multiedit", "apply_patch"],
        "multiedit" => &["multiedit"],
        "applypatch" => &["apply_patch"],
        "grep" | "grepfiles" => &["grep_files", "search_files"],
        "glob" => &["glob"],
        "list" | "ls" | "listdirectory" => &["list_directory"],
        "webfetch" => &["web_fetch"],
        "websearch" => &["web_search"],
        "toolsearch" => &["tool_search"],
        "skill" => &["skill"],
        "task" => &["task"],
        "agent" => &["agent"],
        "batch" => &["batch"],
        "todoread" => &["todo_read"],
        "todowrite" => &["todo_write"],
        "askuser" => &["ask_user"],
        _ => &[],
    }
}

fn normalize_policy_alias(alias: &str) -> String {
    alias
        .chars()
        .filter(|ch| *ch != '_' && *ch != '-' && !ch.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect()
}

fn tool_owner(name: &str) -> &'static str {
    match name {
        "read_file" | "write_file" | "edit_file" | "multiedit" | "read_many_files"
        | "notebook_edit" => "cli-file-tools",
        "run_command" | "powershell" | "batch" => "cli-exec-tools",
        "search_files" | "grep_files" | "glob" | "list_directory" => "cli-navigation",
        "web_search" | "web_fetch" | "tool_search" => "cli-research",
        "skill" => "cli-skills",
        "task" | "agent" => "cli-subagents",
        "team_create" | "team_delete" => "cli-team-registry",
        "cron_create" | "cron_delete" | "cron_list" => "cli-scheduler",
        "enter_worktree" | "exit_worktree" | "list_worktrees" => "cli-worktree",
        "lsp_definition"
        | "lsp_hover"
        | "lsp_diagnostics"
        | "lsp_completion"
        | "lsp_document_symbols"
        | "lsp_format" => "cli-lsp",
        "todo_read" | "todo_write" | "update_plan" => "cli-planning",
        "ask_user" => "cli-human-input",
        "send_message" | "team_task" | "read_messages" | "list_teammates" => {
            "cli-team-collaboration"
        }
        "advisor" => "cli-advisor",
        "apply_patch" => "cli-patch-tools",
        _ => "cli-runtime",
    }
}

fn diagnostic_tags(name: &str, permission_class: &str) -> Vec<String> {
    vec![
        "builtin".to_string(),
        tool_owner(name).to_string(),
        permission_class.to_string(),
    ]
}

fn tool_spec_matches_schema(spec: &str, tool_name: &str) -> bool {
    let alias = spec
        .split_once('(')
        .map(|(alias, _)| alias)
        .unwrap_or(spec)
        .trim();

    alias.eq_ignore_ascii_case(tool_name) || canonical_tool_name(alias) == tool_name
}

pub fn tool_result_size_cap(tool_name: &str) -> Option<usize> {
    let canonical_name = canonical_tool_name(tool_name);
    built_in_tool_definitions()
        .into_iter()
        .chain(team_tool_definitions())
        .find(|tool| tool.name == canonical_name)
        .and_then(|tool| tool.max_result_size_chars)
}

pub fn is_plan_mode_mutating_tool_definition(tool_definition: &ToolDefinition) -> bool {
    tool_definition.name != "update_plan"
        && !tool_definition.is_read_only
        && tool_definition.permission_class != "read_only"
}

pub fn is_plan_mode_mutating_tool(tool_name: &str) -> bool {
    let canonical_name = canonical_tool_name(tool_name);
    built_in_tool_definitions()
        .into_iter()
        .chain(team_tool_definitions())
        .find(|tool| tool.name == canonical_name)
        .map(|tool| is_plan_mode_mutating_tool_definition(&tool))
        .unwrap_or(true)
}

/// Build native API tool definitions with JSON Schema for each built-in tool.
pub fn built_in_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        def(
            "read_file",
            "Read a file's contents (optionally a line range). Always read a file before editing or overwriting it, and before proposing changes to code you have not seen.",
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
            "Create a new file, or OVERWRITE an existing file's entire contents. For targeted changes to an existing file, prefer edit_file; read a file before overwriting it so you do not discard existing content.",
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
            "powershell",
            "Execute a PowerShell command (Windows). Distinct from run_command because of safety checks for destructive verbs, registry paths, and ExecutionPolicy bypass.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "PowerShell command to run"},
                    "working_dir": {"type": "string"},
                    "timeout_sec": {"type": "integer", "default": 30},
                    "safe_mode": {"type": "boolean", "default": true}
                },
                "required": ["command"]
            }),
        ).with_size_cap(50_000),
        def(
            "search_files",
            "Search a regex pattern across files in a directory (like grep -rn), returning file:line matches. Use this to locate code, symbols, definitions, or usages before assuming something does not exist.",
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
             The subagent inherits the current session's tool restrictions and \
             runs concurrently. Use this to parallelize \
             independent work items, e.g., fixing multiple files, running \
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
        def(
            "agent",
            "List installed custom agents or run one exact named agent as a foreground subagent. Agent definitions can narrow tools and turn limits and add persona context, but model-invoked agents cannot change the parent model, trust boundary, or permission mode.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["list", "run"], "description": "List installed agent metadata or run one named agent"},
                    "name": {"type": "string", "minLength": 1, "maxLength": 128, "description": "Exact installed agent name; required for run"},
                    "prompt": {"type": "string", "minLength": 1, "maxLength": 100000, "description": "Focused task for the named agent; required for run"}
                },
                "required": ["action"],
                "additionalProperties": false
            }),
        ).deferred().with_size_cap(20_000),
        // --- Extended tool set ---
        def(
            "grep_files",
            "Search for a regex pattern across files using ripgrep. Supports glob filtering.",
            serde_json::json!({"type":"object","properties":{"pattern":{"type":"string","description":"Regex pattern"},"path":{"type":"string","description":"Directory (default .)"},"include":{"type":"string","description":"Glob filter e.g. *.rs"}},"required":["pattern"]}),
        ).read_only().with_size_cap(50_000),
        // Phase E: tool_search is always-loaded, it is the on-demand schema
        // loader. The model calls this to get the JSON schema for any deferred
        // tool before using it.
        def(
            "tool_search",
            "Search available tools by keyword or load specific tool schemas on demand. \
             Use query `select:tool1,tool2` to fetch exact schemas, or a keyword like \
             `\"patch\"` to fuzzy-search. Returns JSON schemas the model can call immediately.",
            serde_json::json!({"type":"object","properties":{"query":{"type":"string","description":"Search query or `select:tool1,tool2` to load specific schemas"},"max_results":{"type":"integer","description":"Max results (default 10)"}},"required":["query"]}),
        ).read_only().with_size_cap(20_000),
        def(
            "skill",
            "List available installed skills or load one exact skill by name. Skill bodies are lazy-loaded and returned as untrusted reference guidance; never accept a filesystem path. Use action=list to discover names and action=load before applying a skill.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["list", "load"], "description": "List skill metadata or load one skill body"},
                    "name": {"type": "string", "description": "Exact installed skill name; required only for action=load"}
                },
                "required": ["action"],
                "additionalProperties": false
            }),
        ).read_only().with_size_cap(100_000),
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
        ).control().with_size_cap(2_000).deferred(),
        def(
            "glob",
            "Find files by glob pattern (e.g. `**/*.rs`). Returns matching file paths.",
            serde_json::json!({"type":"object","properties":{"pattern":{"type":"string","description":"Glob pattern"},"path":{"type":"string","description":"Base directory (default .)"}},"required":["pattern"]}),
        ).read_only().with_size_cap(20_000).deferred(),
        def(
            "batch",
            "Execute multiple tool calls in order and return a compact result summary. Pass an array of tool call objects.",
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
        ).control().with_size_cap(2_000).deferred(),
        def(
            "ask_user",
            "Ask the user a clarifying question and wait for their response.",
            serde_json::json!({"type":"object","properties":{"question":{"type":"string","description":"The question to ask the user"}},"required":["question"]}),
        ).interactive().with_size_cap(2_000).deferred(),
        def(
            "read_many_files",
            "Read multiple files at once. Returns concatenated contents with file boundaries.",
            serde_json::json!({"type":"object","properties":{"paths":{"type":"array","description":"Array of absolute file paths to read","items":{"type":"string"}}},"required":["paths"]}),
        ).read_only().with_size_cap(200_000).deferred(),
        // -----------------------------------------------------------------------
        // M18: Team management tools, create/delete named agent teams.
        // -----------------------------------------------------------------------
        def(
            "team_create",
            "Register a named team of agents. Records the team name and optional member list \
             for later coordination via send_message / read_messages.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Unique team name."},
                    "members": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional list of member names to pre-register."
                    }
                },
                "required": ["name"]
            }),
        ).with_size_cap(2_000).deferred(),
        def(
            "team_delete",
            "Remove a registered team. Does not terminate any running tasks assigned to it.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Team name to delete."}
                },
                "required": ["name"]
            }),
        ).with_size_cap(2_000).deferred(),
        // -----------------------------------------------------------------------
        // M18: Cron / schedule management tools.
        // -----------------------------------------------------------------------
        def(
            "cron_create",
            "Register a new cron-style scheduled trigger. The schedule is a standard 5-field \
             cron expression (minute hour day month weekday). Returns a trigger ID.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Human-readable trigger name."},
                    "schedule": {"type": "string", "description": "5-field cron expression, e.g. \"0 9 * * *\" for 9 AM daily."},
                    "prompt": {"type": "string", "description": "Prompt to run when the trigger fires."},
                    "enabled": {"type": "boolean", "description": "Whether to enable immediately (default true)."}
                },
                "required": ["name", "schedule", "prompt"]
            }),
        ).with_size_cap(2_000).deferred(),
        def(
            "cron_delete",
            "Remove a cron trigger by its ID or name. Any pending fire for that trigger is cancelled.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "Trigger ID (returned by cron_create) or name."}
                },
                "required": ["id"]
            }),
        ).with_size_cap(2_000).deferred(),
        def(
            "cron_list",
            "List all registered cron triggers with their schedule, enabled status, and last-fired time.",
            serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        ).read_only().with_size_cap(10_000).deferred(),
        // -----------------------------------------------------------------------
        // M24: Advisor tool, consult a higher-tier model for a side question
        // without polluting the main session context.
        // -----------------------------------------------------------------------
        def(
            "advisor",
            "Consult a higher-tier model for a side question without affecting session context. \
             Returns a concise expert answer using the highest-tier available catalog model unless a model override is supplied.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "The question to ask the advisor model."},
                    "model": {"type": "string", "description": "Optional model override; defaults to the highest-tier available."}
                },
                "required": ["question"]
            }),
        ).read_only().with_size_cap(10_000).deferred(),

        // -----------------------------------------------------------------------
        // M35: git worktree wrappers, short-lived isolated checkouts for refactors.
        // -----------------------------------------------------------------------
        def(
            "enter_worktree",
            "Create a git worktree at <target_dir> on a new <branch> based on <base> (default HEAD). \
             Returns the worktree path. Fires WorktreeCreate hook.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "branch": {"type": "string"},
                    "base": {"type": "string"},
                    "target_dir": {"type": "string"}
                },
                "required": ["branch"]
            }),
        ).deferred(),
        def(
            "exit_worktree",
            "Remove a git worktree at <path>. Fires WorktreeRemove hook.",
            serde_json::json!({
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"]
            }),
        ).deferred(),
        def(
            "list_worktrees",
            "List all git worktrees attached to the current repository.",
            serde_json::json!({"type": "object", "properties": {}}),
        ).read_only().deferred(),

        // -----------------------------------------------------------------------
        // M36: basic LSP client. Servers picked by file extension; spawns
        // rust-analyzer / typescript-language-server / gopls / pyright-langserver.
        // -----------------------------------------------------------------------
        def(
            "lsp_definition",
            "Find the definition of a symbol at <file>:<line>:<character> via the language server.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "file": {"type": "string"},
                    "line": {"type": "integer"},
                    "character": {"type": "integer"}
                },
                "required": ["file", "line", "character"]
            }),
        ).read_only().deferred(),
        def(
            "lsp_hover",
            "Get hover (type info, docs) for a symbol at <file>:<line>:<character>.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "file": {"type": "string"},
                    "line": {"type": "integer"},
                    "character": {"type": "integer"}
                },
                "required": ["file", "line", "character"]
            }),
        ).read_only().deferred(),
        def(
            "lsp_diagnostics",
            "Collect language-server diagnostics for <file> (errors, warnings, hints).",
            serde_json::json!({
                "type": "object",
                "properties": {"file": {"type": "string"}},
                "required": ["file"]
            }),
        ).read_only().deferred(),
        def(
            "lsp_completion",
            "Get language-server completion suggestions at <file>:<line>:<character>.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "file": {"type": "string"},
                    "line": {"type": "integer"},
                    "character": {"type": "integer"}
                },
                "required": ["file", "line", "character"]
            }),
        ).read_only().deferred(),
        def(
            "lsp_document_symbols",
            "List all symbols (functions, structs, classes, etc.) defined in <file>.",
            serde_json::json!({
                "type": "object",
                "properties": {"file": {"type": "string"}},
                "required": ["file"]
            }),
        ).read_only().deferred(),
        def(
            "lsp_format",
            "Compute formatting edits for <file> via the language server.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "file": {"type": "string"},
                    "tab_size": {"type": "integer"}
                },
                "required": ["file"]
            }),
        ).read_only().deferred(),
        def(
            "notebook_edit",
            "Edit a Jupyter .ipynb cell (insert / replace / delete by id or index).",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to .ipynb file"},
                    "mode": {"type": "string", "enum": ["insert", "replace", "delete"]},
                    "cell_id": {"type": "string"},
                    "index": {"type": "integer"},
                    "kind": {"type": "string", "enum": ["code", "markdown", "raw"]},
                    "content": {"type": "string"}
                },
                "required": ["path", "mode"]
            }),
        ).with_size_cap(5_000).deferred(),
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
/// - `allowed_tools`, when provided, filters the final tool list by canonical
///   name, reference-compatible alias, or pattern-qualified rule like `Bash(cargo *)`
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
        tool_definitions.retain(|tool_definition| {
            allowed_tools
                .iter()
                .any(|spec| tool_spec_matches_schema(spec, &tool_definition.name))
        });
    }

    tool_definitions
}

fn filter_read_only_builtin_tool_definitions() -> Vec<ToolDefinition> {
    // Use all_builtin_tool_definitions (includes deferred) so read-only
    // exploration tools remain visible in plan mode. `update_plan` is a
    // special non-read-only control tool that must also be visible there.
    all_builtin_tool_definitions()
        .into_iter()
        .filter(|tool_definition| {
            tool_definition.is_read_only || tool_definition.name == "update_plan"
        })
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

    fn all_declared_tool_definitions() -> Vec<ToolDefinition> {
        let mut definitions = built_in_tool_definitions();
        definitions.extend(team_tool_definitions());
        definitions
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
            aliases: Vec::new(),
            owner: "test".to_string(),
            permission_class: "mutating".to_string(),
            diagnostic_tags: vec!["test".to_string()],
        }
    }

    #[test]
    fn placeholder_task_lifecycle_is_not_advertised() {
        let definitions = all_builtin_tool_definitions();
        for name in [
            "task_create",
            "task_get",
            "task_list",
            "task_update",
            "task_stop",
            "task_output",
        ] {
            assert!(
                definitions.iter().all(|definition| definition.name != name),
                "{name} must stay absent until a real execution lifecycle exists"
            );
            assert!(tool_aliases(name).is_empty());
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
                "grep_files",
                "tool_search",
                "skill",
                "update_plan",
                "glob",
                "todo_read",
                "read_many_files",
                "cron_list",
                "advisor",
                "list_worktrees",
                "lsp_definition",
                "lsp_hover",
                "lsp_diagnostics",
                "lsp_completion",
                "lsp_document_symbols",
                "lsp_format",
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
    fn allowed_tools_accept_claude_style_aliases_and_patterns() {
        let allowed_tools = vec![
            "Read".to_string(),
            "Bash(cargo *)".to_string(),
            "ToolSearch".to_string(),
            "Skill".to_string(),
        ];

        let tool_definitions = effective_tool_definitions(false, false, Some(&allowed_tools), None);

        assert_eq!(
            tool_names(&tool_definitions),
            vec!["read_file", "run_command", "tool_search", "skill"]
        );
    }

    #[test]
    fn skill_tool_is_always_loaded_read_only_and_name_scoped() {
        let definition = always_loaded_tool_definitions()
            .into_iter()
            .find(|tool| tool.name == "skill")
            .expect("skill tool is always loaded");

        assert!(definition.is_read_only);
        assert!(definition.is_concurrency_safe);
        assert_eq!(definition.permission_class, "read_only");
        assert_eq!(definition.aliases, vec!["Skill"]);
        let properties = definition.input_schema["properties"]
            .as_object()
            .expect("skill schema properties");
        assert!(properties.contains_key("action"));
        assert!(properties.contains_key("name"));
        assert!(!properties.contains_key("path"));
    }

    #[test]
    fn plan_mode_applies_before_allowed_tools() {
        let allowed_tools = vec!["run_command".to_string(), "read_file".to_string()];

        let tool_definitions = effective_tool_definitions(true, false, Some(&allowed_tools), None);

        assert_eq!(tool_names(&tool_definitions), vec!["read_file"]);
    }

    #[test]
    fn declared_tools_include_diagnostic_metadata() {
        for tool in all_declared_tool_definitions() {
            assert!(!tool.owner.is_empty(), "{} owner is missing", tool.name);
            assert_ne!(
                tool.owner, "cli-runtime",
                "{} should have an explicit owner",
                tool.name
            );
            assert!(
                !tool.permission_class.is_empty(),
                "{} permission class is missing",
                tool.name
            );
            assert!(
                !tool.diagnostic_tags.is_empty(),
                "{} diagnostic tags are missing",
                tool.name
            );
            assert!(
                tool.diagnostic_tags.iter().any(|tag| tag == "builtin"),
                "{} diagnostic tags should mark the builtin source",
                tool.name
            );
            assert!(
                tool.diagnostic_tags.iter().any(|tag| tag == &tool.owner),
                "{} diagnostic tags should include the owner",
                tool.name
            );
            assert!(
                tool.diagnostic_tags
                    .iter()
                    .any(|tag| tag == &tool.permission_class),
                "{} diagnostic tags should include the permission class",
                tool.name
            );
        }
    }

    #[test]
    fn declared_tool_alias_metadata_matches_catalog_helpers() {
        for tool in all_declared_tool_definitions() {
            let expected_aliases = tool_aliases(&tool.name)
                .iter()
                .map(|alias| alias.to_string())
                .collect::<Vec<_>>();

            assert_eq!(
                tool.aliases, expected_aliases,
                "{} aliases should be declared by the catalog helper",
                tool.name
            );

            for alias in tool_aliases(&tool.name) {
                assert_eq!(
                    canonical_tool_name(alias),
                    tool.name,
                    "{alias} should canonicalize to {}",
                    tool.name
                );
            }
        }
    }

    #[test]
    fn policy_aliases_cover_broad_claude_tool_groups() {
        assert!(policy_alias_matches_tool("Read", "read_file"));
        assert!(policy_alias_matches_tool("Read", "read_many_files"));
        assert!(policy_alias_matches_tool("Edit", "edit_file"));
        assert!(policy_alias_matches_tool("Edit", "multiedit"));
        assert!(policy_alias_matches_tool("Edit", "apply_patch"));
        assert!(policy_alias_matches_tool("Grep", "grep_files"));
        assert!(policy_alias_matches_tool("Grep", "search_files"));
        assert!(!policy_alias_matches_tool("Write", "read_file"));
    }

    #[test]
    fn permission_classes_match_read_only_and_control_flags() {
        for tool in all_declared_tool_definitions() {
            match tool.name.as_str() {
                "update_plan" | "todo_write" => assert_eq!(tool.permission_class, "control"),
                "ask_user" => assert_eq!(tool.permission_class, "interactive"),
                _ if tool.is_read_only => assert_eq!(tool.permission_class, "read_only"),
                _ => assert_eq!(tool.permission_class, "mutating"),
            }
        }
    }

    #[test]
    fn plan_mode_mutating_classification_uses_catalog_metadata() {
        assert!(!is_plan_mode_mutating_tool("read_file"));
        assert!(!is_plan_mode_mutating_tool("Read"));
        assert!(is_plan_mode_mutating_tool("run_command"));
        assert!(is_plan_mode_mutating_tool("Bash"));
        assert!(is_plan_mode_mutating_tool("todo_write"));
        assert!(!is_plan_mode_mutating_tool("update_plan"));
        assert!(is_plan_mode_mutating_tool("send_message"));
        assert!(is_plan_mode_mutating_tool("team_task"));
        assert!(is_plan_mode_mutating_tool("read_messages"));
        assert!(!is_plan_mode_mutating_tool("list_teammates"));
        assert!(is_plan_mode_mutating_tool("mcp_custom_tool"));
        assert!(is_plan_mode_mutating_tool("future_tool_without_metadata"));
    }

    #[test]
    fn local_tool_metadata_is_not_serialized_to_provider_schema() {
        let tool = built_in_tool_definitions()
            .into_iter()
            .find(|tool| tool.name == "read_file")
            .expect("read_file should be declared");

        let serialized = serde_json::to_value(tool).expect("tool should serialize");
        let object = serialized
            .as_object()
            .expect("tool should serialize as object");

        assert!(object.contains_key("name"));
        assert!(object.contains_key("description"));
        assert!(object.contains_key("input_schema"));
        assert!(!object.contains_key("aliases"));
        assert!(!object.contains_key("owner"));
        assert!(!object.contains_key("permission_class"));
        assert!(!object.contains_key("diagnostic_tags"));
        assert!(!object.contains_key("is_read_only"));
        assert!(!object.contains_key("is_concurrency_safe"));
        assert!(!object.contains_key("max_result_size_chars"));
        assert!(!object.contains_key("should_defer"));
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
        // M18: cron_list is also deferred + read-only.
        // M24: advisor is deferred + read-only.
        // M35/M36: list_worktrees, lsp_definition, lsp_hover, lsp_diagnostics are read-only.
        // M36 follow-up: lsp_completion, lsp_document_symbols, lsp_format are read-only.
        let mut got = read_only.clone();
        got.sort();
        assert_eq!(
            got,
            vec![
                "advisor",
                "cron_list",
                "glob",
                "grep_files",
                "list_directory",
                "list_worktrees",
                "lsp_completion",
                "lsp_definition",
                "lsp_diagnostics",
                "lsp_document_symbols",
                "lsp_format",
                "lsp_hover",
                "read_file",
                "read_many_files",
                "search_files",
                "skill",
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
        assert_eq!(caps.get("skill"), Some(&Some(100_000)));
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
        assert_eq!(caps.get("agent"), Some(&Some(20_000)));
        assert_eq!(caps.get("update_plan"), Some(&Some(2_000)));
    }

    #[test]
    fn tool_result_size_cap_uses_catalog_metadata_and_aliases() {
        assert_eq!(tool_result_size_cap("run_command"), Some(50_000));
        assert_eq!(tool_result_size_cap("Bash"), Some(50_000));
        assert_eq!(tool_result_size_cap("web_fetch"), Some(200_000));
        assert_eq!(tool_result_size_cap("task"), None);
        assert_eq!(tool_result_size_cap("agent"), Some(20_000));
        assert_eq!(tool_result_size_cap("unknown_tool"), None);
    }
}
