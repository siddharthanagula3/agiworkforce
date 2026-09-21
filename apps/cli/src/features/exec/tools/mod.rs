use std::collections::HashMap;
use std::future::Future;
use std::io::IsTerminal;
use std::pin::Pin;
use std::sync::Arc;

use agiworkforce_protocol::tool_primitive::{
    ToolErrorClass, ToolResult as ContractToolResult, ToolResultStatus,
};
use anyhow::Result;
use dialoguer::Confirm;
use serde::Deserialize;
use serde_json::Value;

#[cfg(test)]
use agiworkforce_protocol::tool_primitive::{ToolActionClass, ToolPermissionDecision};

use crate::agent::ToolCall;
use crate::tui::approval_broker::ApprovalRequestKind;

mod bash;
mod common;
mod dir_ops;
mod file_ops;
mod git;
pub mod registry;
mod task_registry;
mod web;

use bash::execute_run_command;
pub(crate) use common::generate_simple_diff;
pub(crate) use common::COMMAND_TIMEOUT;
use common::{describe_command, print_tool_status, truncate_output_with_save};
#[cfg(test)]
use common::{
    format_size, is_dangerous_command, tool_size_cap, truncate_by_lines, truncate_line,
    MAX_FILE_LINES, MAX_LINE_LENGTH, MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES, TRUNCATION_HEAD_LINES,
    TRUNCATION_TAIL_LINES,
};
use dir_ops::{execute_glob, execute_grep_files, execute_list_directory, execute_search_files};
use file_ops::{
    execute_apply_patch, execute_multiedit, execute_read_file, execute_read_many_files,
    execute_write_file,
};
use git::{
    execute_enter_worktree, execute_exit_worktree, execute_git_tool, execute_list_worktrees,
};
use task_registry::{
    execute_advisor, execute_ask_user, execute_cron_create, execute_cron_delete, execute_cron_list,
    execute_lsp_completion, execute_lsp_definition, execute_lsp_diagnostics,
    execute_lsp_document_symbols, execute_lsp_format, execute_lsp_hover, execute_team_create,
    execute_team_delete, execute_todo_read, execute_todo_write,
};
#[cfg(test)]
use web::is_private_or_internal_ip;
use web::{execute_tool_search, execute_web_fetch, execute_web_search};
pub(crate) use web::{WEB_FETCH_CALL_TIMEOUT, WEB_SEARCH_TIMEOUT};

use crate::tui::approval_broker::{ApprovalDecision, ApprovalRequest};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

pub struct ToolResult {
    #[allow(dead_code)]
    pub tool_name: String,
    pub success: bool,
    pub output: String,
}

impl ToolResult {
    // AUDIT-FIX: H-8, marker accessor for callers; web_fetch wraps output in <web_fetch_result untrusted="true" ...>.
    #[allow(dead_code)]
    pub fn is_untrusted(&self) -> bool {
        let output = self.output.trim_start();
        output.starts_with("<web_fetch_result untrusted=\"true\"")
            || output.starts_with("<skill_result untrusted=\"true\"")
    }

    /// This result expressed as the cross-surface tool primitive (decision
    /// D-P0-5, `agiworkforce_protocol::tool_primitive`).
    ///
    /// The CLI records a failure as one boolean and a message, so every
    /// failure lands in the contract's `internal` class. Classifying them
    /// properly means widening this struct, which is a change to the CLI's own
    /// executors and not part of adopting the contract.
    #[allow(dead_code)]
    pub fn to_contract(&self, call_id: String) -> ContractToolResult {
        ContractToolResult {
            call_id,
            tool: self.tool_name.clone(),
            status: if self.success {
                ToolResultStatus::Ok
            } else {
                ToolResultStatus::Error
            },
            error_class: (!self.success).then_some(ToolErrorClass::Internal),
            message: (!self.success).then(|| self.output.clone()),
            artifacts: Vec::new(),
            cost: None,
        }
    }
}

#[cfg(test)]
mod contract_mapping_tests {
    use super::*;

    #[test]
    fn a_successful_result_carries_no_error_class_or_message() {
        let contract = ToolResult {
            tool_name: String::from("read_file"),
            success: true,
            output: String::from("contents"),
        }
        .to_contract(String::from("call-1"));
        assert_eq!(contract.status, ToolResultStatus::Ok);
        assert!(contract.error_class.is_none());
        assert!(contract.message.is_none());
        assert_eq!(contract.tool, "read_file");
    }

    #[test]
    fn a_failed_result_carries_the_output_as_the_message() {
        let contract = ToolResult {
            tool_name: String::from("run_command"),
            success: false,
            output: String::from("exit status 1"),
        }
        .to_contract(String::from("call-2"));
        assert_eq!(contract.status, ToolResultStatus::Error);
        assert_eq!(contract.error_class, Some(ToolErrorClass::Internal));
        assert_eq!(contract.message.as_deref(), Some("exit status 1"));
    }

    #[test]
    fn every_read_only_registry_tool_declares_the_read_class() {
        let registry = build_read_only_registry();
        assert!(!registry.is_empty());
        for name in registry.names() {
            let tool = registry.get(name).expect("registered tool");
            assert!(tool.read_only(), "{name}");
            assert_eq!(
                tool.contract_action_class(),
                ToolActionClass::Read,
                "{name}"
            );
        }
    }

    #[tokio::test]
    async fn a_permission_request_hook_sees_every_approval_and_can_deny_it() {
        let scratch = tempfile::tempdir().unwrap();
        let seen = scratch.path().join("seen.json");
        let hook = |command: String| crate::hooks::Hook {
            command,
            args: Vec::new(),
            timeout: 5,
            blocking: true,
            matcher: None,
            if_condition: None,
            source: crate::hooks::HookSource::User,
        };
        let mut hooks = std::collections::HashMap::new();
        hooks.insert(
            "PermissionRequest".to_string(),
            vec![hook(format!("cat > '{}'", seen.display()))],
        );
        let request = ApprovalRequest::new(
            ApprovalRequestKind::Exec {
                command: "rm -rf build".to_string(),
            },
            "Run rm -rf build?",
            Vec::new(),
        );
        let observing = crate::hooks::HooksConfig { hooks };
        assert_eq!(
            permission_request_hook_denial(&observing, &request).await,
            None
        );
        let payload: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&seen).unwrap()).unwrap();
        assert_eq!(payload["event"], "PermissionRequest");
        assert_eq!(payload["tool_name"], "run_command");
        assert_eq!(payload["tool_args"]["command"], "rm -rf build");

        let mut hooks = std::collections::HashMap::new();
        hooks.insert(
            "PermissionRequest".to_string(),
            vec![hook(
                "printf '%s' '{\"decision\":\"block\",\"reason\":\"no deletes\"}'".to_string(),
            )],
        );
        let denying = crate::hooks::HooksConfig { hooks };
        assert_eq!(
            permission_request_hook_denial(&denying, &request).await,
            Some(vec!["no deletes".to_string()])
        );
    }

    #[test]
    fn the_shared_shell_policy_verdict_maps_onto_the_contract() {
        assert_eq!(
            ToolPermissionDecision::from(agiworkforce_execpolicy::Decision::Allow),
            ToolPermissionDecision::Allow
        );
        assert_eq!(
            ToolPermissionDecision::from(agiworkforce_execpolicy::Decision::Prompt),
            ToolPermissionDecision::Ask
        );
        assert_eq!(
            ToolPermissionDecision::from(agiworkforce_execpolicy::Decision::Forbidden),
            ToolPermissionDecision::Deny
        );
    }
}

pub type ApprovalCallback = Arc<
    dyn Fn(ApprovalRequest) -> Pin<Box<dyn Future<Output = ApprovalDecision> + Send>> + Send + Sync,
>;

#[derive(Clone)]
pub struct ToolExecOptions {
    pub require_confirmation: bool,
    pub auto_approve_safe: bool,
    /// `acceptEdits`: a file edit runs without asking. Shell commands still ask.
    pub auto_approve_edits: bool,
    pub quiet: bool,
    pub approval_callback: Option<ApprovalCallback>,
    /// Trust boundary of the session that requested this invocation.
    ///
    /// Tool policy must travel with each call. A process-global flag is unsafe
    /// because the CLI app-server can host concurrent Local and BYOK sessions.
    pub privacy_mode: crate::agent::PrivacyMode,
    /// Workspace whose `.agiworkforce/policy.toml` governs this call.
    ///
    /// This is carried per invocation for the same reason as `privacy_mode`:
    /// the app-server can host a workspace that is not the process cwd.
    pub workspace_root: Option<std::path::PathBuf>,
    /// The session's connected MCP tools, for `tool_search` to load a schema
    /// the initial list deferred. Per invocation, like the two fields above:
    /// concurrent sessions connect to different servers.
    pub mcp_tool_definitions: Option<std::sync::Arc<Vec<crate::models::ToolDefinition>>>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// C1 Tool-trait registry, read-only cluster
// ---------------------------------------------------------------------------
// Each read-only tool is a `registry::Tool` adapter over its existing executor.
// `build_read_only_registry()` assembles them so the dispatch can resolve these
// tools through the trait instead of a hard-coded match arm. Mutating tools
// (write/run/edit/patch) keep their bespoke approval-callback signatures and
// migrate in follow-on increments.

struct ReadFileTool;
#[async_trait::async_trait]
impl registry::Tool for ReadFileTool {
    fn name(&self) -> &'static str {
        "read_file"
    }
    fn read_only(&self) -> bool {
        true
    }
    async fn invoke(&self, args: &HashMap<String, String>, quiet: bool) -> Result<ToolResult> {
        execute_read_file_with_opts(args, quiet).await
    }
}

struct SearchFilesTool;
#[async_trait::async_trait]
impl registry::Tool for SearchFilesTool {
    fn name(&self) -> &'static str {
        "search_files"
    }
    fn read_only(&self) -> bool {
        true
    }
    async fn invoke(&self, args: &HashMap<String, String>, quiet: bool) -> Result<ToolResult> {
        execute_search_files_with_opts(args, quiet).await
    }
}

struct ListDirectoryTool;
#[async_trait::async_trait]
impl registry::Tool for ListDirectoryTool {
    fn name(&self) -> &'static str {
        "list_directory"
    }
    fn read_only(&self) -> bool {
        true
    }
    async fn invoke(&self, args: &HashMap<String, String>, quiet: bool) -> Result<ToolResult> {
        execute_list_directory_with_opts(args, quiet).await
    }
}

struct GlobTool;
#[async_trait::async_trait]
impl registry::Tool for GlobTool {
    fn name(&self) -> &'static str {
        "glob"
    }
    fn read_only(&self) -> bool {
        true
    }
    async fn invoke(&self, args: &HashMap<String, String>, _quiet: bool) -> Result<ToolResult> {
        execute_glob(args).await
    }
}

struct GrepFilesTool;
#[async_trait::async_trait]
impl registry::Tool for GrepFilesTool {
    fn name(&self) -> &'static str {
        "grep_files"
    }
    fn read_only(&self) -> bool {
        true
    }
    async fn invoke(&self, args: &HashMap<String, String>, quiet: bool) -> Result<ToolResult> {
        execute_grep_files(args, quiet).await
    }
}

struct SkillTool;
#[async_trait::async_trait]
impl registry::Tool for SkillTool {
    fn name(&self) -> &'static str {
        "skill"
    }
    fn read_only(&self) -> bool {
        true
    }
    async fn invoke(&self, args: &HashMap<String, String>, _quiet: bool) -> Result<ToolResult> {
        let action = args.get("action").map(String::as_str).unwrap_or("");
        let name = args.get("name").map(String::as_str);
        let available_tools: Vec<String> =
            crate::runtime::tool_catalog::all_builtin_tool_definitions()
                .into_iter()
                .chain(crate::runtime::tool_catalog::team_tool_definitions())
                .map(|definition| definition.name)
                .collect();
        let skills = crate::skills::discover_skills();
        match crate::skills::invoke_skill_tool(&skills, action, name, &available_tools) {
            Ok(output) => Ok(ToolResult {
                tool_name: "skill".to_string(),
                success: true,
                output,
            }),
            Err(output) => Ok(ToolResult {
                tool_name: "skill".to_string(),
                success: false,
                output,
            }),
        }
    }
}

/// Build the registry of read-only tools migrated to the [`registry::Tool`] trait.
pub fn build_read_only_registry() -> registry::ToolRegistry {
    let mut reg = registry::ToolRegistry::new();
    reg.register(Box::new(ReadFileTool));
    reg.register(Box::new(SearchFilesTool));
    reg.register(Box::new(ListDirectoryTool));
    reg.register(Box::new(GlobTool));
    reg.register(Box::new(GrepFilesTool));
    reg.register(Box::new(SkillTool));
    reg
}

#[allow(dead_code)]
pub async fn execute_tool(call: &ToolCall, require_confirmation: bool) -> Result<ToolResult> {
    let opts = ToolExecOptions {
        mcp_tool_definitions: None,
        require_confirmation,
        auto_approve_safe: false,
        auto_approve_edits: false,
        quiet: false,
        approval_callback: None,
        // A sessionless invocation has no authority to leave the device.
        privacy_mode: crate::agent::PrivacyMode::Local,
        workspace_root: std::env::current_dir().ok(),
    };
    execute_tool_with_opts(call, &opts).await
}

pub async fn execute_tool_with_opts(call: &ToolCall, opts: &ToolExecOptions) -> Result<ToolResult> {
    let canonical_name = canonical_tool_name(&call.name);

    // Network-capable built-ins are a trust-boundary operation, even when
    // their catalog classification is read-only. Local means no hidden API or
    // cloud call; the user must create an explicit BYOK/Managed continuation.
    // A browser command leaves this device by definition: it acts in the
    // user's signed-in Chrome and brings page content back into the
    // conversation.
    if opts.privacy_mode == crate::agent::PrivacyMode::Local
        && matches!(
            canonical_name,
            "web_search"
                | "web_fetch"
                | "advisor"
                | "browser_read_page"
                | "browser_click"
                | "browser_type"
                | "browser_navigate"
                | "browser_screenshot"
        )
    {
        return Ok(ToolResult {
            tool_name: canonical_name.to_string(),
            success: false,
            output: format!(
                "{canonical_name} is unavailable in Local privacy mode: network context must not leave this device. Create an explicit BYOK or Managed continuation to use this tool."
            ),
        });
    }

    let pre_approved = (opts.auto_approve_safe
        && is_catalog_read_only_tool(canonical_name)
        && !crate::platform::runtime::tool_catalog::reads_a_private_surface(canonical_name))
        || (opts.auto_approve_edits
            && crate::platform::runtime::tool_catalog::is_file_edit_tool(canonical_name));
    let mut require_confirm = opts.require_confirmation && !pre_approved;
    // Set when the user approved this exact call under the policy prompt, so the
    // trust gate below does not ask a second time for one command.
    let mut approved_this_call = false;
    if let Some(workspace_root) = opts.workspace_root.as_deref() {
        let policy = crate::platform::policy::PolicyEngine::load_layered(workspace_root)?;
        if policy.has_rules() {
            let primary_argument = policy_primary_argument(canonical_name, &call.args);
            let decision = effective_workspace_policy_decision(
                policy.resolve(canonical_name, &primary_argument),
                workspace_policy_is_trusted(workspace_root),
            );
            match decision {
                crate::platform::policy::PolicyDecision::Deny => {
                    return Ok(ToolResult {
                        tool_name: canonical_name.to_string(),
                        success: false,
                        output: format!(
                            "Tool `{canonical_name}` is denied by {}/.agiworkforce/policy.toml and was not run.",
                            workspace_root.display()
                        ),
                    });
                }
                crate::platform::policy::PolicyDecision::Allow => {
                    require_confirm = false;
                }
                crate::platform::policy::PolicyDecision::Ask => {
                    let request = ApprovalRequest::new(
                        ApprovalRequestKind::WorkspacePolicy {
                            tool_name: canonical_name.to_string(),
                            primary_argument: primary_argument.clone(),
                        },
                        format!("Workspace policy requires approval for `{canonical_name}`"),
                        vec![
                            format!("workspace: {}", workspace_root.display()),
                            format!("argument: {primary_argument}"),
                        ],
                    );
                    let allowed = if let Some(decision) =
                        request_approval(opts.approval_callback.as_ref(), request).await
                    {
                        approval_allows(decision)
                    } else {
                        Confirm::new()
                            .with_prompt(format!(
                                "Workspace policy requires approval for `{canonical_name}`. Allow it?"
                            ))
                            .default(false)
                            .interact()
                            .unwrap_or(false)
                    };
                    if !allowed {
                        return Ok(ToolResult {
                            tool_name: canonical_name.to_string(),
                            success: false,
                            output: format!(
                                "Tool `{canonical_name}` was not approved under the workspace policy."
                            ),
                        });
                    }
                    // The workspace policy approval is the one authoritative prompt
                    // for this invocation; do not immediately ask a second time in
                    // the tool-specific executor.
                    require_confirm = false;
                    approved_this_call = true;
                }
            }
        }
    }

    if let Some(workspace_root) = opts.workspace_root.as_deref() {
        if let Some(refusal) = untrusted_shell_refusal(
            canonical_name,
            &call.args,
            workspace_root,
            opts.approval_callback.as_ref(),
            approved_this_call,
        )
        .await
        {
            return Ok(refusal);
        }
    }

    // C1: read-only tools resolve through the Tool-trait registry first. They are
    // side-effect-free, so they bypass the confirmation flow regardless.
    static READ_ONLY_REGISTRY: std::sync::OnceLock<registry::ToolRegistry> =
        std::sync::OnceLock::new();
    if let Some(tool) = READ_ONLY_REGISTRY
        .get_or_init(build_read_only_registry)
        .get(canonical_name)
    {
        return tool.invoke(&call.args, opts.quiet).await;
    }

    let boundary_gated = match canonical_name {
        "web_fetch" => opts.require_confirmation,
        _ => require_confirm,
    };
    if boundary_gated {
        if let Some(request) = trust_boundary_approval(canonical_name, &call.args) {
            let allowed =
                match request_approval(opts.approval_callback.as_ref(), request.clone()).await {
                    Some(decision) => approval_allows(decision),
                    None => Confirm::new()
                        .with_prompt(format!("{} Allow it?", request.summary))
                        .default(false)
                        .interact()
                        .unwrap_or(false),
                };
            if !allowed {
                return Ok(ToolResult {
                    tool_name: canonical_name.to_string(),
                    success: false,
                    output: format!("`{canonical_name}` was not approved and did not run."),
                });
            }
        }
    }

    let result = match canonical_name {
        "write_file" => {
            execute_write_file(&call.args, require_confirm, opts.approval_callback.as_ref()).await
        }
        "run_command" => {
            execute_run_command(&call.args, require_confirm, opts.approval_callback.as_ref()).await
        }
        // read_file / search_files / list_directory / glob / grep_files are
        // resolved earlier via the C1 read-only registry.
        "edit_file" => {
            file_ops::execute_edit_file(
                &call.args,
                require_confirm,
                opts.approval_callback.as_ref(),
            )
            .await
        }
        "browser_read_page" | "browser_click" | "browser_type" | "browser_navigate"
        | "browser_screenshot" => execute_browser_command(canonical_name, &call.args).await,
        "web_search" => execute_web_search_with_opts(&call.args, opts.quiet).await,
        "web_fetch" => execute_web_fetch_with_opts(&call.args, opts.quiet).await,
        "apply_patch" => {
            execute_apply_patch(&call.args, require_confirm, opts.approval_callback.as_ref()).await
        }
        "resolve_conflict" => {
            execute_resolve_conflict(
                &call.args,
                opts.workspace_root.as_deref(),
                require_confirm,
                opts.approval_callback.as_ref(),
            )
            .await
        }
        "tool_search" => {
            let mcp_tools = opts
                .mcp_tool_definitions
                .as_deref()
                .map(Vec::as_slice)
                .unwrap_or(&[]);
            execute_tool_search(&call.args, mcp_tools).await
        }
        "agent" => {
            let action = call.args.get("action").map(String::as_str).unwrap_or("");
            if action == "list" {
                Ok(ToolResult {
                    tool_name: "agent".to_string(),
                    success: true,
                    output: crate::agents::agent_tool_catalog(),
                })
            } else if action == "run" {
                Ok(ToolResult {
                    tool_name: "agent".to_string(),
                    success: false,
                    output:
                        "Named-agent runs must be handled by the foreground subagent orchestrator."
                            .to_string(),
                })
            } else {
                Ok(ToolResult {
                    tool_name: "agent".to_string(),
                    success: false,
                    output: "agent.action must be 'list' or 'run'.".to_string(),
                })
            }
        }
        "batch" => Box::pin(execute_batch(call, opts)).await,
        "multiedit" => {
            execute_multiedit(&call.args, require_confirm, opts.approval_callback.as_ref()).await
        }
        "powershell" => {
            execute_powershell(&call.args, require_confirm, opts.approval_callback.as_ref()).await
        }
        "notebook_edit" => execute_notebook_edit(&call.args, require_confirm).await,
        "todo_read" => execute_todo_read(opts.workspace_root.as_deref()).await,
        "todo_write" => execute_todo_write(&call.args, opts.workspace_root.as_deref()).await,
        "ask_user" => execute_ask_user(&call.args).await,
        "read_many_files" => execute_read_many_files(&call.args).await,
        "team_create" => execute_team_create(&call.args).await,
        "team_delete" => execute_team_delete(&call.args).await,
        "cron_create" => execute_cron_create(&call.args, opts.privacy_mode).await,
        "cron_delete" => execute_cron_delete(&call.args, opts.privacy_mode).await,
        "cron_list" => execute_cron_list(&call.args, opts.privacy_mode).await,
        "advisor" => execute_advisor(&call.args, opts.privacy_mode).await,
        "enter_worktree" => {
            execute_enter_worktree(&call.args, require_confirm, opts.approval_callback.as_ref())
                .await
        }
        "exit_worktree" => {
            execute_exit_worktree(&call.args, require_confirm, opts.approval_callback.as_ref())
                .await
        }
        "list_worktrees" => execute_list_worktrees(&call.args).await,
        "lsp_definition" => execute_lsp_definition(&call.args).await,
        "lsp_hover" => execute_lsp_hover(&call.args).await,
        "lsp_diagnostics" => execute_lsp_diagnostics(&call.args).await,
        "lsp_completion" => execute_lsp_completion(&call.args).await,
        "lsp_document_symbols" => execute_lsp_document_symbols(&call.args).await,
        "lsp_format" => execute_lsp_format(&call.args).await,
        // The typed Git API: one tool per operation, dispatched from the same
        // spec table the catalog is built from, so a tool cannot be advertised
        // without reaching an operation.
        name if crate::runtime::git_tools::is_git_tool(name) => {
            execute_git_tool(
                name,
                &call.args,
                opts.workspace_root.as_deref(),
                require_confirm,
                std::io::stdin().is_terminal(),
                opts.approval_callback.as_ref(),
            )
            .await
        }
        _ => Ok(unknown_tool_result(&call.name)),
    };

    result
}

fn trust_boundary_approval(
    tool_name: &str,
    args: &HashMap<String, String>,
) -> Option<ApprovalRequest> {
    let argument = |key: &str| {
        args.get(key)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    };
    let computer_use = |target: String, summary: &str| {
        Some(ApprovalRequest::new(
            ApprovalRequestKind::ComputerUse {
                action: tool_name.to_string(),
                target: target.clone(),
            },
            summary,
            vec![format!("target: {target}")],
        ))
    };
    match tool_name {
        "browser_read_page" => computer_use(
            "active tab".to_string(),
            "The agent wants to read the page open in your signed-in Chrome.",
        ),
        "browser_screenshot" => computer_use(
            "active tab".to_string(),
            "The agent wants to capture the active tab of your signed-in Chrome.",
        ),
        "browser_click" => computer_use(
            argument("selector").unwrap_or_default(),
            "The agent wants to click in your signed-in Chrome.",
        ),
        "browser_type" => computer_use(
            argument("selector").unwrap_or_default(),
            "The agent wants to type into your signed-in Chrome.",
        ),
        "browser_navigate" => computer_use(
            argument("url").unwrap_or_default(),
            "The agent wants to open an address in your signed-in Chrome.",
        ),
        "web_fetch" => {
            let url = argument("url").unwrap_or_default();
            if !web::is_internal_fetch_target(&url) {
                return None;
            }
            let destination = reqwest::Url::parse(&url)
                .ok()
                .and_then(|parsed| parsed.host_str().map(str::to_string))
                .unwrap_or(url);
            Some(ApprovalRequest::new(
                ApprovalRequestKind::Network {
                    tool_name: tool_name.to_string(),
                    destination: destination.clone(),
                },
                format!(
                    "The agent wants to fetch {destination}, which is on this computer, its private network or a cloud metadata service."
                ),
                vec![format!("destination: {destination}")],
            ))
        }
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
struct HunkResolution {
    hunk: usize,
    choice: String,
    #[serde(default)]
    lines: Option<Vec<String>>,
}

/// Turn the tool's wire shape into the resolutions the workflow takes. An
/// unknown choice is refused rather than mapped onto a side.
fn parse_hunk_resolutions(
    json: &str,
) -> std::result::Result<Vec<(usize, crate::merge_conflicts::Resolution)>, String> {
    use crate::merge_conflicts::{ConflictSide, Resolution};

    let parsed: Vec<HunkResolution> =
        serde_json::from_str(json).map_err(|error| format!("Invalid resolutions JSON: {error}"))?;
    if parsed.is_empty() {
        return Err("resolutions is empty; every conflicted hunk needs one".to_string());
    }
    let mut resolutions = Vec::with_capacity(parsed.len());
    let mut seen = std::collections::HashSet::new();
    for entry in parsed {
        if !seen.insert(entry.hunk) {
            return Err(format!("hunk {} has more than one resolution", entry.hunk));
        }
        let resolution = match entry.choice.as_str() {
            "union" => Resolution::Union,
            "custom" => Resolution::Custom(entry.lines.ok_or_else(|| {
                format!("hunk {} uses choice=custom but has no lines", entry.hunk)
            })?),
            side => Resolution::Take(ConflictSide::parse(side).ok_or_else(|| {
                format!(
                    "hunk {} has an unknown choice '{side}'; use ours, theirs, base, union or custom",
                    entry.hunk
                )
            })?),
        };
        resolutions.push((entry.hunk, resolution));
    }
    Ok(resolutions)
}

async fn execute_resolve_conflict(
    args: &HashMap<String, String>,
    workspace_root: Option<&std::path::Path>,
    require_confirm: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> Result<ToolResult> {
    let refuse = |output: String| {
        Ok(ToolResult {
            tool_name: "resolve_conflict".to_string(),
            success: false,
            output,
        })
    };
    let Some(path) = args
        .get("path")
        .map(|path| path.trim())
        .filter(|path| !path.is_empty())
    else {
        return refuse("Missing required argument: path".to_string());
    };
    let Some(resolutions_json) = args.get("resolutions") else {
        return refuse("Missing required argument: resolutions".to_string());
    };
    let resolutions = match parse_hunk_resolutions(resolutions_json) {
        Ok(resolutions) => resolutions,
        Err(message) => return refuse(message),
    };
    let root = match workspace_root {
        Some(root) => crate::project_scope::resolve_project_scope(root),
        None => match std::env::current_dir() {
            Ok(cwd) => crate::project_scope::resolve_project_scope(&cwd),
            Err(error) => return refuse(format!("Cannot resolve the repository root: {error}")),
        },
    };
    let relative = std::path::Path::new(path);
    if relative.is_absolute() {
        return refuse("path must be relative to the repository root".to_string());
    }

    if require_confirm {
        let request = ApprovalRequest::new(
            ApprovalRequestKind::FileEdit {
                path: std::path::PathBuf::from(path),
            },
            format!(
                "Resolve {} merge conflict hunk(s) in {path}",
                resolutions.len()
            ),
            vec![format!("repository: {}", root.display())],
        );
        let allowed = match request_approval(approval_callback, request.clone()).await {
            Some(decision) => approval_allows(decision),
            None => Confirm::new()
                .with_prompt(format!("{} Allow it?", request.summary))
                .default(false)
                .interact()
                .unwrap_or(false),
        };
        if !allowed {
            return refuse("`resolve_conflict` was not approved and did not run.".to_string());
        }
    }

    let run_tests_requested = args
        .get("run_tests")
        .is_some_and(|value| matches!(value.trim(), "true" | "1" | "yes"));
    let run_tests = if run_tests_requested {
        if !crate::trust::is_trusted(&root) {
            return refuse(
                "Post-resolution tests cannot run directly in an untrusted workspace; resolve the file, then run the test through the shell tool's sandbox and approval gate."
                    .to_string(),
            );
        }
        let Some(test) = crate::merge_conflicts::detect_test_command(&root) else {
            return refuse(
                "No repository test command is declared for this workspace.".to_string(),
            );
        };
        let request = ApprovalRequest::new(
            ApprovalRequestKind::Exec {
                command: test.to_string(),
            },
            format!("Run post-resolution tests: {test}"),
            vec![format!("repository: {}", root.display())],
        );
        let allowed = match request_approval(approval_callback, request.clone()).await {
            Some(decision) => approval_allows(decision),
            None => Confirm::new()
                .with_prompt(format!("{} Allow it?", request.summary))
                .default(false)
                .interact()
                .unwrap_or(false),
        };
        if !allowed {
            return refuse(
                "Post-resolution tests were not approved; no resolution was applied.".to_string(),
            );
        }
        true
    } else {
        false
    };
    match crate::merge_conflicts::resolve_conflicted_file(&root, relative, &resolutions, run_tests)
        .await
    {
        Ok(outcome) => Ok(ToolResult {
            tool_name: "resolve_conflict".to_string(),
            success: outcome.tests.as_ref().is_none_or(|tests| tests.success),
            output: outcome.summary(),
        }),
        Err(error) => refuse(format!("{error:#}")),
    }
}

fn policy_primary_argument(tool_name: &str, args: &HashMap<String, String>) -> String {
    let preferred_keys: &[&str] = match tool_name {
        "run_command" | "powershell" => &["command"],
        "write_file" | "edit_file" | "notebook_edit" | "read_file" | "resolve_conflict" => {
            &["path", "file_path"]
        }
        "web_fetch" => &["url"],
        "web_search" | "search_files" | "grep_files" => &["query", "pattern"],
        "advisor" | "ask_user" => &["question"],
        _ => &["path", "command", "query", "url", "question", "name"],
    };
    preferred_keys
        .iter()
        .find_map(|key| args.get(*key))
        .cloned()
        .unwrap_or_default()
}

pub(crate) fn workspace_policy_is_trusted(workspace_root: &std::path::Path) -> bool {
    crate::trust::is_trusted(workspace_root)
}

fn effective_workspace_policy_decision(
    resolution: crate::platform::policy::PolicyResolution,
    workspace_is_trusted: bool,
) -> crate::platform::policy::PolicyDecision {
    use crate::platform::policy::{PolicyDecision, PolicyLayer};

    match (resolution.decision, resolution.layer) {
        // A repository-controlled file must not be able to remove an approval
        // boundary until the user has explicitly trusted that repository. The
        // managed and user layers are not repository-controlled, so they keep
        // their decision either way.
        (PolicyDecision::Allow, Some(PolicyLayer::Workspace)) if !workspace_is_trusted => {
            PolicyDecision::Ask
        }
        (decision, _) => decision,
    }
}

/// Refuse a shell tool in a workspace that has not been trusted, unless the
/// user approves this one command. No auto-approval mode waives it: a
/// repository the user has not vouched for does not get a shell on this machine.
async fn untrusted_shell_refusal(
    canonical_name: &str,
    args: &HashMap<String, String>,
    workspace_root: &std::path::Path,
    approval_callback: Option<&ApprovalCallback>,
    already_approved: bool,
) -> Option<ToolResult> {
    if !matches!(canonical_name, "run_command" | "powershell") {
        return None;
    }
    let status = crate::trust::status_for(workspace_root);
    if status.restrictions().unrestricted_shell || already_approved {
        return None;
    }
    let command = args.get("command").cloned().unwrap_or_default();
    let request = ApprovalRequest::new(
        ApprovalRequestKind::Exec {
            command: command.clone(),
        },
        format!(
            "{} is not a trusted workspace; running a shell command here needs explicit approval",
            status.root.display()
        ),
        vec![
            format!("command: {command}"),
            format!("trust: {}", status.state.label()),
        ],
    );
    let allowed = match request_approval(approval_callback, request).await {
        Some(decision) => approval_allows(decision),
        None => false,
    };
    if allowed {
        return None;
    }
    Some(ToolResult {
        tool_name: canonical_name.to_string(),
        success: false,
        output: format!(
            "`{canonical_name}` was blocked: {} is not trusted. Run /trust grant to trust this workspace, or approve the command when prompted.",
            status.root.display()
        ),
    })
}

pub(crate) async fn request_approval(
    approval_callback: Option<&ApprovalCallback>,
    request: ApprovalRequest,
) -> Option<ApprovalDecision> {
    let hooks_config = crate::hooks::load_hooks_or_default();
    if let Some(reasons) = permission_request_hook_denial(&hooks_config, &request).await {
        eprintln!(
            "{} {}",
            crate::terminal_style::warning("Denied by PermissionRequest hook:"),
            crate::terminal_text::sanitize_terminal_text(&reasons.join("; "))
        );
        return Some(ApprovalDecision::Deny);
    }
    let callback = approval_callback?;
    Some(callback(request).await)
}

fn approval_request_tool(kind: &ApprovalRequestKind) -> (&'static str, serde_json::Value) {
    match kind {
        ApprovalRequestKind::Exec { command } => {
            ("run_command", serde_json::json!({ "command": command }))
        }
        ApprovalRequestKind::FileWrite { path } => {
            ("write_file", serde_json::json!({ "path": path }))
        }
        ApprovalRequestKind::FileEdit { path } => {
            ("edit_file", serde_json::json!({ "path": path }))
        }
        ApprovalRequestKind::Patch { files } => {
            ("apply_patch", serde_json::json!({ "files": files }))
        }
        ApprovalRequestKind::LoopDetection { repeated_action } => (
            "loop_detection",
            serde_json::json!({ "action": repeated_action }),
        ),
        ApprovalRequestKind::McpTool {
            server_name,
            tool_name,
        } => (
            "mcp",
            serde_json::json!({ "server": server_name, "tool": tool_name }),
        ),
        ApprovalRequestKind::McpElicitation { server_name } => (
            "mcp_elicitation",
            serde_json::json!({ "server": server_name }),
        ),
        ApprovalRequestKind::AskUser { question } => {
            ("ask_user", serde_json::json!({ "question": question }))
        }
        ApprovalRequestKind::Hook { hook_name } => {
            ("hook", serde_json::json!({ "hook": hook_name }))
        }
        ApprovalRequestKind::Subagent { name } => ("task", serde_json::json!({ "name": name })),
        ApprovalRequestKind::TrustDirectory { path } => {
            ("trust_directory", serde_json::json!({ "path": path }))
        }
        ApprovalRequestKind::WorkspacePolicy {
            tool_name: _,
            primary_argument,
        } => (
            "workspace_policy",
            serde_json::json!({ "argument": primary_argument }),
        ),
        ApprovalRequestKind::ComputerUse { action, target } => (
            "computer_use",
            serde_json::json!({ "action": action, "target": target }),
        ),
        ApprovalRequestKind::Network {
            tool_name: _,
            destination,
        } => ("network", serde_json::json!({ "destination": destination })),
        ApprovalRequestKind::Git {
            tool_name: _,
            target,
        } => ("git", serde_json::json!({ "target": target })),
        ApprovalRequestKind::GitPush {
            remote,
            branch,
            force,
        } => (
            "git_push",
            serde_json::json!({ "remote": remote, "branch": branch, "force": force }),
        ),
    }
}

pub(crate) async fn permission_request_hook_denial(
    hooks_config: &crate::hooks::HooksConfig,
    request: &ApprovalRequest,
) -> Option<Vec<String>> {
    let (fallback_name, tool_args) = approval_request_tool(&request.kind);
    let tool_name = match &request.kind {
        ApprovalRequestKind::WorkspacePolicy { tool_name, .. } => tool_name.clone(),
        ApprovalRequestKind::McpTool { tool_name, .. } => tool_name.clone(),
        ApprovalRequestKind::ComputerUse { action, .. } => action.clone(),
        ApprovalRequestKind::Network { tool_name, .. } => tool_name.clone(),
        ApprovalRequestKind::Git { tool_name, .. } => tool_name.clone(),
        _ => fallback_name.to_string(),
    };
    let results = crate::hooks::run_hooks(
        hooks_config,
        crate::hooks::HookEvent::PermissionRequest,
        &crate::hooks::HookInput {
            event: crate::hooks::HookEvent::PermissionRequest.to_string(),
            session_id: None,
            model: None,
            tool_name: Some(tool_name),
            tool_args: Some(tool_args),
            tool_output: None,
            message: Some(request.summary.clone()),
            tool_execution: None,
        },
    )
    .await;
    match crate::hooks::aggregate_results(&results) {
        crate::hooks::HookAggregateOutcome::Blocked { reasons } => Some(reasons),
        _ => None,
    }
}

pub(crate) fn approval_allows(decision: ApprovalDecision) -> bool {
    matches!(
        decision,
        ApprovalDecision::AllowOnce
            | ApprovalDecision::AllowSession
            | ApprovalDecision::AlwaysAllow
    )
}

pub(crate) fn canonical_tool_name(tool_name: &str) -> &str {
    crate::runtime::tool_catalog::canonical_tool_name(tool_name)
}

fn is_catalog_read_only_tool(tool_name: &str) -> bool {
    let canonical_name = canonical_tool_name(tool_name);
    crate::runtime::tool_catalog::all_builtin_tool_definitions()
        .into_iter()
        .any(|tool| tool.name == canonical_name && tool.is_read_only)
}

fn unknown_tool_result(requested: &str) -> ToolResult {
    let mut known: Vec<String> = crate::runtime::tool_catalog::all_builtin_tool_definitions()
        .into_iter()
        .chain(crate::runtime::tool_catalog::team_tool_definitions())
        .map(|tool| tool.name)
        .collect();
    known.sort();
    known.dedup();

    let needle = requested.to_lowercase();
    let suggestions: Vec<&str> = known
        .iter()
        .map(String::as_str)
        .filter(|name| {
            let lower = name.to_lowercase();
            lower.contains(&needle) || needle.contains(&lower)
        })
        .take(5)
        .collect();

    let available = known
        .iter()
        .take(24)
        .cloned()
        .collect::<Vec<_>>()
        .join(", ");
    let mut output = format!("Unknown tool: {requested}");
    if !suggestions.is_empty() {
        output.push_str(&format!("\nDid you mean: {}?", suggestions.join(", ")));
    }
    output.push_str(&format!("\nAvailable tools include: {available}"));
    if known.len() > 24 {
        output.push_str(&format!(" (+{} more; use tool_search)", known.len() - 24));
    }

    ToolResult {
        tool_name: requested.to_string(),
        success: false,
        output,
    }
}

// ---------------------------------------------------------------------------
// Quiet-mode wrappers
// ---------------------------------------------------------------------------

async fn execute_read_file_with_opts(
    args: &HashMap<String, String>,
    quiet: bool,
) -> Result<ToolResult> {
    if quiet {
        file_ops::execute_read_file_inner(args).await
    } else {
        execute_read_file(args).await
    }
}

async fn execute_search_files_with_opts(
    args: &HashMap<String, String>,
    _quiet: bool,
) -> Result<ToolResult> {
    execute_search_files(args).await
}

async fn execute_list_directory_with_opts(
    args: &HashMap<String, String>,
    _quiet: bool,
) -> Result<ToolResult> {
    execute_list_directory(args).await
}

async fn execute_web_search_with_opts(
    args: &HashMap<String, String>,
    _quiet: bool,
) -> Result<ToolResult> {
    execute_web_search(args).await
}

async fn execute_web_fetch_with_opts(
    args: &HashMap<String, String>,
    _quiet: bool,
) -> Result<ToolResult> {
    execute_web_fetch(args).await
}

// ---------------------------------------------------------------------------
// Tool family: the user's paired browser
// ---------------------------------------------------------------------------

/// Turn the CLI's flat string arguments into the JSON the shell expects.
///
/// Arguments arrive here as strings because that is the CLI's tool-call shape,
/// so a boolean and a number have to be recovered rather than passed through.
/// An unparseable value is passed as the string it was: the shell validates
/// every argument itself and says what was wrong, which is a better answer
/// than this layer guessing.
fn browser_command_args(
    command: &str,
    args: &HashMap<String, String>,
) -> serde_json::Map<String, Value> {
    let mut out = serde_json::Map::new();
    let mut copy_string = |key: &str| {
        if let Some(value) = args.get(key) {
            out.insert(key.to_string(), Value::String(value.clone()));
        }
    };
    match command {
        "browser_click" => copy_string("selector"),
        "browser_type" => {
            copy_string("selector");
            copy_string("text");
            if let Some(clear) = args.get("clear") {
                out.insert("clear".to_string(), Value::Bool(clear == "true"));
            }
        }
        "browser_navigate" => copy_string("url"),
        _ => {}
    }
    out
}

async fn execute_browser_command(
    command: &str,
    args: &HashMap<String, String>,
) -> Result<ToolResult> {
    print_tool_status(
        command,
        &crate::runtime::tool_catalog::tool_status_line(command, |key| args.get(key).cloned())
            .unwrap_or_else(|| command.to_string()),
    );
    let identity =
        crate::browser_bridge::ClientIdentity::for_cli(std::env::current_dir().ok(), None);
    let payload = Value::Object(browser_command_args(command, args));
    match crate::browser_bridge::run_command(command, payload, identity).await {
        Ok(value) => Ok(ToolResult {
            tool_name: command.to_string(),
            success: true,
            output: match &value {
                Value::String(text) => text.clone(),
                other => serde_json::to_string_pretty(other).unwrap_or_else(|_| other.to_string()),
            },
        }),
        Err(failure) => Ok(ToolResult {
            tool_name: command.to_string(),
            success: false,
            output: failure.user_message(),
        }),
    }
}

// ---------------------------------------------------------------------------
// Tool: batch
// ---------------------------------------------------------------------------

async fn execute_batch(call: &ToolCall, opts: &ToolExecOptions) -> Result<ToolResult> {
    let calls_json = match call
        .args
        .get("calls")
        .or_else(|| call.args.get("tool_calls"))
    {
        Some(j) => j,
        None => {
            return Ok(ToolResult {
                tool_name: "batch".into(),
                success: false,
                output: "Missing required argument: calls (JSON array)".into(),
            });
        }
    };

    #[derive(Debug, Deserialize)]
    struct BatchItem {
        #[serde(default)]
        name: Option<String>,
        #[serde(default)]
        tool: Option<String>,
        #[serde(default)]
        args: serde_json::Map<String, Value>,
    }

    let parsed: Vec<BatchItem> = serde_json::from_str(calls_json)
        .map_err(|e| anyhow::anyhow!("Invalid calls JSON: {}", e))?;

    const MAX_BATCH: usize = 25;
    if parsed.len() > MAX_BATCH {
        return Ok(ToolResult {
            tool_name: "batch".into(),
            success: false,
            output: format!(
                "Batch limited to {} tool calls, got {}",
                MAX_BATCH,
                parsed.len()
            ),
        });
    }

    print_tool_status("batch", &format!("Batch({} tools)", parsed.len()));

    let mut results: Vec<Result<ToolResult>> = Vec::new();
    for item in &parsed {
        let name = item
            .name
            .as_deref()
            .or(item.tool.as_deref())
            .unwrap_or("unknown")
            .to_string();
        let args: HashMap<String, String> = item
            .args
            .iter()
            .map(|(k, v)| {
                let value = match v {
                    Value::String(s) => s.clone(),
                    _ => v.to_string(),
                };
                (k.clone(), value)
            })
            .collect();

        let tool_call = ToolCall { name, args };
        results.push(execute_tool_with_opts(&tool_call, opts).await);
    }

    let mut output_parts = Vec::new();
    let mut success_count = 0usize;
    let total = results.len();

    for (i, result) in results.into_iter().enumerate() {
        match result {
            Ok(tr) => {
                if tr.success {
                    success_count += 1;
                }
                output_parts.push(format!(
                    "[{}/{}] {}, {}: {}",
                    i + 1,
                    total,
                    if tr.success { "OK" } else { "FAIL" },
                    tr.tool_name,
                    tr.output.lines().next().unwrap_or("(empty)")
                ));
            }
            Err(e) => {
                output_parts.push(format!("[{}/{}] ERROR: {}", i + 1, total, e));
            }
        }
    }

    Ok(ToolResult {
        tool_name: "batch".into(),
        success: success_count == total,
        output: format!(
            "Batch complete: {}/{} succeeded\n{}",
            success_count,
            total,
            output_parts.join("\n")
        ),
    })
}

async fn execute_powershell(
    args: &HashMap<String, String>,
    require_confirmation: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> Result<ToolResult> {
    let command = match args.get("command") {
        Some(command) => command.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "powershell".into(),
                success: false,
                output: "Missing required argument: command".into(),
            });
        }
    };

    // The same containment run_command has: a directory inside the workspace,
    // checked before anything is asked or run.
    let working_dir = match bash::command_working_dir(args) {
        Ok(dir) => dir,
        Err(reason) => {
            return Ok(ToolResult {
                tool_name: "powershell".into(),
                success: false,
                output: format!("The command was not run: {reason}"),
            });
        }
    };

    let timeout_sec = args
        .get("timeout_sec")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(30);
    let safe_mode = args
        .get("safe_mode")
        .map(|value| {
            matches!(
                value.as_str(),
                "1" | "true" | "TRUE" | "True" | "yes" | "YES"
            )
        })
        .unwrap_or(true);

    print_tool_status("powershell", &format!("PowerShell({})", command));
    let permission_command = format!("powershell -NoProfile -NonInteractive -Command {}", command);

    if require_confirmation {
        let perms = crate::permissions::PermissionStore::load().unwrap_or_default();
        match perms.check_command(&permission_command) {
            Some(true) => {}
            Some(false) => {
                return Ok(ToolResult {
                    tool_name: "powershell".into(),
                    success: false,
                    output: format!(
                        "PowerShell command is denied by saved permissions. Use /permissions reset to clear.\n{}",
                        describe_command(&permission_command)
                    ),
                });
            }
            None => {
                if let Some(decision) = request_approval(
                    approval_callback,
                    ApprovalRequest::new(
                        ApprovalRequestKind::Exec {
                            command: permission_command.clone(),
                        },
                        "Allow this PowerShell command?",
                        vec![describe_command(&permission_command)],
                    ),
                )
                .await
                {
                    if !approval_allows(decision) {
                        return Ok(ToolResult {
                            tool_name: "powershell".into(),
                            success: false,
                            output: "User denied PowerShell command execution".into(),
                        });
                    }

                    let mut perms = crate::permissions::PermissionStore::load().unwrap_or_default();
                    match decision {
                        ApprovalDecision::AllowSession => {
                            perms.allow_session_for_process(&permission_command);
                        }
                        ApprovalDecision::AlwaysAllow => {
                            perms.allow_always(&permission_command);
                            let _ = perms.save();
                        }
                        _ => {}
                    }
                } else {
                    let confirmed = Confirm::new()
                        .with_prompt("Allow this PowerShell command?")
                        .default(false)
                        .interact()
                        .unwrap_or(false);

                    if !confirmed {
                        return Ok(ToolResult {
                            tool_name: "powershell".into(),
                            success: false,
                            output: "User denied PowerShell command execution".into(),
                        });
                    }

                    let mut perms = crate::permissions::PermissionStore::load().unwrap_or_default();
                    perms.allow_session_for_process(&permission_command);
                }
            }
        }
    }

    let request = crate::powershell_tool::PowerShellRequest {
        command,
        working_dir: working_dir.map(|dir| dir.display().to_string()),
        timeout_sec,
        safe_mode,
    };

    match crate::powershell_tool::execute(&request).await {
        Ok(output) => {
            let mut combined = String::new();
            if !output.stdout.is_empty() {
                combined.push_str(&output.stdout);
            }
            if !output.stderr.is_empty() {
                if !combined.is_empty() {
                    combined.push('\n');
                }
                combined.push_str("[stderr]\n");
                combined.push_str(&output.stderr);
            }
            if combined.is_empty() {
                combined = "(no output)".into();
            }
            if !output.warnings.is_empty() {
                combined.push_str("\n[warnings]\n");
                combined.push_str(&output.warnings.join("\n"));
            }
            Ok(ToolResult {
                tool_name: "powershell".into(),
                success: output.exit_code == 0,
                output: truncate_output_with_save(
                    "powershell",
                    format!("Exit code: {}\n{}", output.exit_code, combined),
                ),
            })
        }
        Err(e) => Ok(ToolResult {
            tool_name: "powershell".into(),
            success: false,
            output: format!("PowerShell command failed: {}", e),
        }),
    }
}

async fn execute_notebook_edit(
    args: &HashMap<String, String>,
    require_confirm: bool,
) -> Result<ToolResult> {
    let path = match args.get("path") {
        Some(path) => path,
        None => {
            return Ok(ToolResult {
                tool_name: "notebook_edit".into(),
                success: false,
                output: "Missing required argument: path".into(),
            });
        }
    };
    let mode = match args.get("mode") {
        Some(mode) => mode,
        None => {
            return Ok(ToolResult {
                tool_name: "notebook_edit".into(),
                success: false,
                output: "Missing required argument: mode".into(),
            });
        }
    };

    let validated_path = match common::validate_file_path(path) {
        Ok(path) => path,
        Err(reason) => {
            return Ok(ToolResult {
                tool_name: "notebook_edit".into(),
                success: false,
                output: format!("Path rejected: {}", reason),
            });
        }
    };

    if validated_path.extension().and_then(|ext| ext.to_str()) != Some("ipynb") {
        return Ok(ToolResult {
            tool_name: "notebook_edit".into(),
            success: false,
            output: "File must be a Jupyter notebook (.ipynb)".into(),
        });
    }
    let edit_mode = match mode.as_str() {
        "insert" => crate::notebook_edit::NotebookEditMode::Insert,
        "replace" => crate::notebook_edit::NotebookEditMode::Replace,
        "delete" => crate::notebook_edit::NotebookEditMode::Delete,
        _ => {
            return Ok(ToolResult {
                tool_name: "notebook_edit".into(),
                success: false,
                output: "mode must be one of: insert, replace, delete".into(),
            });
        }
    };

    let kind = match args.get("kind").map(String::as_str) {
        Some("code") => Some(crate::notebook_edit::CellKind::Code),
        Some("markdown") => Some(crate::notebook_edit::CellKind::Markdown),
        Some("raw") => Some(crate::notebook_edit::CellKind::Raw),
        Some(_) => {
            return Ok(ToolResult {
                tool_name: "notebook_edit".into(),
                success: false,
                output: "kind must be one of: code, markdown, raw".into(),
            });
        }
        None => None,
    };

    let index = match args.get("index") {
        Some(value) => match value.parse::<usize>() {
            Ok(index) => Some(index),
            Err(_) => {
                return Ok(ToolResult {
                    tool_name: "notebook_edit".into(),
                    success: false,
                    output: "index must be a non-negative integer".into(),
                });
            }
        },
        None => None,
    };

    if let Err(message) = crate::file_state::ensure_previously_read_and_fresh(&validated_path) {
        return Ok(ToolResult {
            tool_name: "notebook_edit".into(),
            success: false,
            output: message,
        });
    }

    print_tool_status(
        "notebook_edit",
        &format!("NotebookEdit({}, {})", path, mode),
    );

    if require_confirm {
        let confirmed = dialoguer::Confirm::new()
            .with_prompt("Allow this notebook edit?")
            .default(true)
            .interact()
            .unwrap_or(false);
        if !confirmed {
            return Ok(ToolResult {
                tool_name: "notebook_edit".into(),
                success: false,
                output: "User denied notebook edit".into(),
            });
        }
    }

    let request = crate::notebook_edit::NotebookEditRequest {
        path: validated_path.to_string_lossy().into_owned(),
        mode: edit_mode,
        cell_id: args.get("cell_id").cloned(),
        index,
        kind,
        content: args.get("content").cloned(),
    };

    let result = tokio::task::spawn_blocking(move || crate::notebook_edit::apply(&request)).await;
    match result {
        Ok(Ok(output)) => {
            if let Ok(content) = std::fs::read_to_string(&validated_path) {
                crate::file_state::record_file_write(&validated_path, &content);
            }
            Ok(ToolResult {
                tool_name: "notebook_edit".into(),
                success: true,
                output: format!(
                    "Notebook edit applied: {:?} cell {:?} at index {} ({} total cells)",
                    output.mode, output.affected_cell_id, output.affected_index, output.total_cells
                ),
            })
        }
        Ok(Err(e)) => Ok(ToolResult {
            tool_name: "notebook_edit".into(),
            success: false,
            output: format!("Notebook edit failed: {}", e),
        }),
        Err(e) => Ok(ToolResult {
            tool_name: "notebook_edit".into(),
            success: false,
            output: format!("Notebook edit task failed: {}", e),
        }),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {

    #[tokio::test]
    async fn powershell_refuses_a_working_dir_outside_the_workspace_before_asking_or_running() {
        let outside = tempfile::tempdir().expect("outside");
        let mut args = HashMap::new();
        args.insert("command".to_string(), "Get-ChildItem".to_string());
        args.insert(
            "working_dir".to_string(),
            outside.path().display().to_string(),
        );

        let result = execute_powershell(&args, true, None)
            .await
            .expect("tool result");

        assert!(!result.success);
        assert!(
            result.output.starts_with("The command was not run:"),
            "{}",
            result.output
        );
    }
    use super::*;
    use std::collections::BTreeSet;

    fn recording_callback(
        decision: ApprovalDecision,
    ) -> (
        ApprovalCallback,
        std::sync::Arc<std::sync::Mutex<Vec<ApprovalRequestKind>>>,
    ) {
        let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let recorder = std::sync::Arc::clone(&seen);
        let callback: ApprovalCallback = std::sync::Arc::new(move |request| {
            let recorder = std::sync::Arc::clone(&recorder);
            Box::pin(async move {
                recorder.lock().expect("seen lock").push(request.kind);
                decision
            })
        });
        (callback, seen)
    }

    fn byok_options(callback: ApprovalCallback, auto_approve_safe: bool) -> ToolExecOptions {
        ToolExecOptions {
            mcp_tool_definitions: None,
            require_confirmation: true,
            auto_approve_safe,
            auto_approve_edits: false,
            quiet: true,
            approval_callback: Some(callback),
            privacy_mode: crate::agent::PrivacyMode::Byok,
            workspace_root: None,
        }
    }

    #[tokio::test]
    async fn a_browser_action_asks_for_computer_use_approval_before_it_runs() {
        let (callback, seen) = recording_callback(ApprovalDecision::Deny);
        let call = ToolCall {
            name: "browser_click".to_string(),
            args: HashMap::from([("selector".to_string(), "#buy".to_string())]),
        };
        let result = execute_tool_with_opts(&call, &byok_options(callback, true))
            .await
            .expect("tool result");
        assert!(!result.success);
        assert_eq!(
            result.output,
            "`browser_click` was not approved and did not run."
        );
        assert_eq!(
            *seen.lock().expect("seen lock"),
            vec![ApprovalRequestKind::ComputerUse {
                action: "browser_click".to_string(),
                target: "#buy".to_string(),
            }]
        );
    }

    fn fetch(url: &str) -> ToolCall {
        ToolCall {
            name: "web_fetch".to_string(),
            args: HashMap::from([("url".to_string(), url.to_string())]),
        }
    }

    #[test]
    fn public_web_fetch_and_search_carry_no_approval_in_any_mode() {
        assert!(
            trust_boundary_approval("web_fetch", &fetch("https://docs.rs/serde").args).is_none()
        );
        let search = HashMap::from([("query".to_string(), "rust serde".to_string())]);
        assert!(trust_boundary_approval("web_search", &search).is_none());
    }

    #[tokio::test]
    async fn a_fetch_to_this_machine_its_network_or_metadata_asks_even_when_safe_tools_are_approved(
    ) {
        for (url, host) in [
            ("http://127.0.0.1:8080/admin", "127.0.0.1"),
            (
                "http://169.254.169.254/latest/meta-data/",
                "169.254.169.254",
            ),
            ("http://10.0.0.7/", "10.0.0.7"),
        ] {
            for auto_approve_safe in [false, true] {
                let (callback, seen) = recording_callback(ApprovalDecision::Deny);
                let result =
                    execute_tool_with_opts(&fetch(url), &byok_options(callback, auto_approve_safe))
                        .await
                        .expect("tool result");
                assert!(!result.success);
                assert_eq!(
                    result.output,
                    "`web_fetch` was not approved and did not run."
                );
                assert_eq!(
                    *seen.lock().expect("seen lock"),
                    vec![ApprovalRequestKind::Network {
                        tool_name: "web_fetch".to_string(),
                        destination: host.to_string(),
                    }]
                );
            }
        }
    }

    #[tokio::test]
    async fn a_headless_private_fetch_is_denied_without_a_prompt_surface() {
        let mut opts = byok_options(recording_callback(ApprovalDecision::AllowOnce).0, false);
        opts.approval_callback = None;
        let result = execute_tool_with_opts(&fetch("http://127.0.0.1/"), &opts)
            .await
            .expect("tool result");
        assert!(!result.success);
        assert_eq!(
            result.output,
            "`web_fetch` was not approved and did not run."
        );
    }

    #[test]
    fn only_trust_boundary_tools_carry_a_boundary_approval() {
        assert!(trust_boundary_approval("read_file", &HashMap::new()).is_none());
        assert!(trust_boundary_approval("run_command", &HashMap::new()).is_none());
        let (name, args) = approval_request_tool(&ApprovalRequestKind::Network {
            tool_name: "run_command".to_string(),
            destination: "the network".to_string(),
        });
        assert_eq!(name, "network");
        assert_eq!(args["destination"], "the network");
    }

    #[test]
    fn skill_results_are_marked_untrusted() {
        let result = ToolResult {
            tool_name: "skill".to_string(),
            success: true,
            output: "<skill_result untrusted=\"true\" name=\"docs\">body</skill_result>"
                .to_string(),
        };

        assert!(result.is_untrusted());
    }

    #[tokio::test]
    async fn skill_tool_dispatches_through_read_only_registry() {
        let registry = build_read_only_registry();
        let tool = registry.get("skill").expect("skill registry entry");
        let args = HashMap::from([("action".to_string(), "list".to_string())]);

        let result = tool.invoke(&args, true).await.expect("invoke skill list");

        assert!(result.success);
        assert_eq!(result.tool_name, "skill");
        assert!(result.output.contains("\"skills\""));
    }

    #[tokio::test]
    async fn local_mode_blocks_builtin_network_tools_before_dispatch() {
        let opts = ToolExecOptions {
            mcp_tool_definitions: None,
            require_confirmation: false,
            auto_approve_safe: true,
            auto_approve_edits: false,
            quiet: true,
            approval_callback: None,
            privacy_mode: crate::agent::PrivacyMode::Local,
            workspace_root: std::env::current_dir().ok(),
        };

        for name in ["web_search", "web_fetch"] {
            let call = ToolCall {
                name: name.to_string(),
                // These arguments are deliberately invalid for network use;
                // the trust gate must run before provider or URL validation.
                args: HashMap::new(),
            };
            let result = execute_tool_with_opts(&call, &opts)
                .await
                .expect("Local tool policy result");
            assert!(!result.success, "{name} must fail in Local mode");
            assert!(
                result.output.contains("unavailable in Local privacy mode"),
                "{name} reached its executor instead of the Local egress gate: {}",
                result.output
            );
        }
    }

    #[tokio::test]
    async fn workspace_policy_toml_denies_tool_before_dispatch() {
        let workspace = tempfile::tempdir().expect("workspace");
        let policy_dir = workspace.path().join(".agiworkforce");
        std::fs::create_dir_all(&policy_dir).expect("policy dir");
        std::fs::write(
            policy_dir.join("policy.toml"),
            r#"
[[rules]]
tool = "run_command"
pattern = "^printf policy-denied$"
decision = "deny"
priority = 500
reason = "regression test"
"#,
        )
        .expect("policy");

        let call = ToolCall {
            name: "run_command".to_string(),
            args: HashMap::from([("command".to_string(), "printf policy-denied".to_string())]),
        };
        let opts = ToolExecOptions {
            mcp_tool_definitions: None,
            require_confirmation: false,
            auto_approve_safe: true,
            auto_approve_edits: false,
            quiet: true,
            approval_callback: None,
            privacy_mode: crate::agent::PrivacyMode::Local,
            workspace_root: Some(workspace.path().to_path_buf()),
        };

        let result = execute_tool_with_opts(&call, &opts)
            .await
            .expect("policy result");
        assert!(!result.success);
        assert!(result.output.contains("denied by"));
        assert!(result.output.contains(".agiworkforce/policy.toml"));
    }

    #[tokio::test]
    async fn workspace_policy_ask_gates_even_a_read_only_tool() {
        let workspace = tempfile::tempdir().expect("workspace");
        let policy_dir = workspace.path().join(".agiworkforce");
        std::fs::create_dir_all(&policy_dir).expect("policy dir");
        std::fs::write(
            policy_dir.join("policy.toml"),
            r#"
[[rules]]
tool = "read_file"
pattern = "secret.txt$"
decision = "ask"
"#,
        )
        .expect("policy");

        let seen = std::sync::Arc::new(std::sync::Mutex::new(None));
        let seen_for_callback = seen.clone();
        let callback: ApprovalCallback = std::sync::Arc::new(move |request| {
            let seen_for_callback = seen_for_callback.clone();
            Box::pin(async move {
                *seen_for_callback.lock().expect("seen lock") = Some(request.kind);
                ApprovalDecision::Deny
            })
        });
        let call = ToolCall {
            name: "read_file".to_string(),
            args: HashMap::from([(
                "path".to_string(),
                workspace.path().join("secret.txt").display().to_string(),
            )]),
        };
        let opts = ToolExecOptions {
            mcp_tool_definitions: None,
            require_confirmation: false,
            auto_approve_safe: true,
            auto_approve_edits: false,
            quiet: true,
            approval_callback: Some(callback),
            privacy_mode: crate::agent::PrivacyMode::Local,
            workspace_root: Some(workspace.path().to_path_buf()),
        };

        let result = execute_tool_with_opts(&call, &opts)
            .await
            .expect("policy result");
        assert!(!result.success);
        assert!(matches!(
            seen.lock().expect("seen lock").as_ref(),
            Some(ApprovalRequestKind::WorkspacePolicy { tool_name, .. })
                if tool_name == "read_file"
        ));
    }

    #[tokio::test]
    async fn a_policy_edited_mid_session_decides_the_very_next_call() {
        let workspace = tempfile::Builder::new()
            .prefix("policy-mid-session")
            .tempdir_in(std::env::current_dir().expect("cwd"))
            .expect("workspace");
        let policy_dir = workspace.path().join(".agiworkforce");
        std::fs::create_dir_all(&policy_dir).expect("policy dir");
        let policy = policy_dir.join("policy.toml");
        let notes = workspace.path().join("notes.txt");
        std::fs::write(&notes, "kept notes").expect("notes");
        let write_rule = |decision: &str| {
            std::fs::write(
                &policy,
                format!(
                    "[[rules]]\ntool = \"read_file\"\npattern = \"notes.txt$\"\ndecision = \"{decision}\"\n"
                ),
            )
            .expect("policy");
        };

        let asked = std::sync::Arc::new(std::sync::Mutex::new(0usize));
        let asked_by_callback = asked.clone();
        let callback: ApprovalCallback = std::sync::Arc::new(move |_request| {
            let asked_by_callback = asked_by_callback.clone();
            Box::pin(async move {
                *asked_by_callback.lock().expect("asked") += 1;
                ApprovalDecision::Deny
            })
        });
        let call = ToolCall {
            name: "read_file".to_string(),
            args: HashMap::from([("path".to_string(), notes.display().to_string())]),
        };
        let opts = ToolExecOptions {
            mcp_tool_definitions: None,
            require_confirmation: false,
            auto_approve_safe: true,
            auto_approve_edits: false,
            quiet: true,
            approval_callback: Some(callback),
            privacy_mode: crate::agent::PrivacyMode::Local,
            workspace_root: Some(workspace.path().to_path_buf()),
        };
        let run = || execute_tool_with_opts(&call, &opts);

        let before = run().await.expect("no policy");
        assert!(before.success, "{}", before.output);
        assert!(before.output.contains("kept notes"));

        write_rule("deny");
        let denied = run().await.expect("deny");
        assert!(!denied.success);
        assert!(denied.output.contains("denied by"), "{}", denied.output);

        write_rule("ask");
        let asked_result = run().await.expect("ask");
        assert!(!asked_result.success);
        assert_eq!(*asked.lock().expect("asked"), 1, "the ask rule never asked");

        std::fs::remove_file(&policy).expect("drop the rule");
        let after = run().await.expect("rule removed");
        assert!(after.success, "{}", after.output);
        assert_eq!(
            *asked.lock().expect("asked"),
            1,
            "a removed rule still put a prompt in front of the user"
        );
    }

    /// Every tool the catalog classes as a file edit is pointed at a file
    /// outside the workspace with approval already granted, so the only thing
    /// left to stop it is the workspace boundary.
    #[tokio::test]
    async fn no_file_editing_tool_changes_a_file_outside_the_workspace() {
        let outside = tempfile::tempdir().expect("outside dir");
        let cwd = std::env::current_dir().expect("cwd");
        assert!(
            !outside.path().starts_with(&cwd),
            "the fixture must sit outside the workspace"
        );
        let text = outside.path().join("unrelated.txt");
        let notebook = outside.path().join("unrelated.ipynb");
        let text_before = "left alone\n";
        let notebook_before = r#"{"cells":[{"cell_type":"code","id":"a","metadata":{},"source":["x = 1"],"outputs":[],"execution_count":null}],"metadata":{},"nbformat":4,"nbformat_minor":5}"#;
        std::fs::write(&text, text_before).expect("text");
        std::fs::write(&notebook, notebook_before).expect("notebook");
        crate::file_state::record_file_read(&text, text_before);
        crate::file_state::record_file_read(&notebook, notebook_before);
        let created = outside.path().join("created.txt");
        let text_path = text.display().to_string();

        let editing_tools: Vec<String> =
            crate::platform::runtime::tool_catalog::all_builtin_tool_definitions()
                .into_iter()
                .map(|definition| definition.name)
                .filter(|name| crate::platform::runtime::tool_catalog::is_file_edit_tool(name))
                .collect();
        assert!(editing_tools.len() >= 5, "{editing_tools:?}");

        for name in &editing_tools {
            let pairs: Vec<(&str, String)> = match name.as_str() {
                "write_file" => vec![
                    ("path", created.display().to_string()),
                    ("content", "moved\n".into()),
                ],
                "edit_file" => vec![
                    ("path", text_path.clone()),
                    ("old_string", "left alone".into()),
                    ("new_string", "moved".into()),
                ],
                "multiedit" => vec![
                    ("path", text_path.clone()),
                    (
                        "edits",
                        r#"[{"old_string":"left alone","new_string":"moved"}]"#.into(),
                    ),
                ],
                "apply_patch" => vec![(
                    "patch",
                    format!(
                        "--- a/{text_path}\n+++ b/{text_path}\n@@ -1 +1 @@\n-left alone\n+moved\n"
                    ),
                )],
                "resolve_conflict" => vec![
                    ("path", text_path.clone()),
                    ("resolutions", r#"[{"hunk":1,"choice":"ours"}]"#.into()),
                ],
                "notebook_edit" => vec![
                    ("path", notebook.display().to_string()),
                    ("mode", "replace".into()),
                    ("cell_id", "a".into()),
                    ("content", "x = 2".into()),
                ],
                "lsp_format" => vec![("file", text_path.clone())],
                other => panic!("{other} edits files and has no boundary fixture here"),
            };
            let call = ToolCall {
                name: name.clone(),
                args: pairs
                    .into_iter()
                    .map(|(key, value)| (key.to_string(), value))
                    .collect(),
            };
            let opts = ToolExecOptions {
                mcp_tool_definitions: None,
                require_confirmation: false,
                auto_approve_safe: true,
                auto_approve_edits: true,
                quiet: true,
                approval_callback: None,
                privacy_mode: crate::agent::PrivacyMode::Local,
                workspace_root: Some(cwd.clone()),
            };
            if let Ok(result) = execute_tool_with_opts(&call, &opts).await {
                assert!(
                    !result.success,
                    "{name} reported success outside the workspace"
                );
            }
            assert_eq!(
                std::fs::read_to_string(&text).expect("text"),
                text_before,
                "{name} changed a file outside the workspace"
            );
            assert_eq!(
                std::fs::read_to_string(&notebook).expect("notebook"),
                notebook_before,
                "{name} changed a notebook outside the workspace"
            );
            assert!(
                !created.exists(),
                "{name} created a file outside the workspace"
            );
        }
    }

    #[tokio::test]
    async fn invalid_workspace_policy_fails_closed_before_tool_dispatch() {
        let workspace = tempfile::tempdir().expect("workspace");
        let policy_dir = workspace.path().join(".agiworkforce");
        std::fs::create_dir_all(&policy_dir).expect("policy dir");
        std::fs::write(
            policy_dir.join("policy.toml"),
            r#"
[[rules]]
tool = "run_command"
pattern = "["
decision = "deny"
"#,
        )
        .expect("policy");

        let call = ToolCall {
            name: "run_command".to_string(),
            args: HashMap::from([("command".to_string(), "printf unsafe".to_string())]),
        };
        let opts = ToolExecOptions {
            mcp_tool_definitions: None,
            require_confirmation: false,
            auto_approve_safe: true,
            auto_approve_edits: false,
            quiet: true,
            approval_callback: None,
            privacy_mode: crate::agent::PrivacyMode::Local,
            workspace_root: Some(workspace.path().to_path_buf()),
        };

        let error = match execute_tool_with_opts(&call, &opts).await {
            Ok(_) => panic!("invalid deny policy must fail closed"),
            Err(error) => error,
        };
        assert!(error.to_string().contains("invalid regex"));
    }

    #[test]
    fn untrusted_workspace_cannot_auto_approve_itself() {
        use crate::platform::policy::{PolicyDecision, PolicyLayer, PolicyResolution};

        let resolution = |decision, layer| PolicyResolution {
            decision,
            layer: Some(layer),
            locked: false,
            reason: None,
        };

        assert_eq!(
            effective_workspace_policy_decision(
                resolution(PolicyDecision::Allow, PolicyLayer::Workspace),
                false
            ),
            PolicyDecision::Ask
        );
        assert_eq!(
            effective_workspace_policy_decision(
                resolution(PolicyDecision::Deny, PolicyLayer::Workspace),
                false
            ),
            PolicyDecision::Deny
        );
        assert_eq!(
            effective_workspace_policy_decision(
                resolution(PolicyDecision::Allow, PolicyLayer::Workspace),
                true
            ),
            PolicyDecision::Allow
        );
        // An administrator's allow is not repository-controlled, so an
        // untrusted checkout does not downgrade it.
        assert_eq!(
            effective_workspace_policy_decision(
                resolution(PolicyDecision::Allow, PolicyLayer::Managed),
                false
            ),
            PolicyDecision::Allow
        );
    }

    #[test]
    fn resolve_conflict_maps_every_choice_and_refuses_an_unknown_one() {
        use crate::merge_conflicts::{ConflictSide, Resolution};

        let parsed = parse_hunk_resolutions(
            r#"[{"hunk":1,"choice":"ours"},{"hunk":2,"choice":"theirs"},{"hunk":3,"choice":"union"},{"hunk":4,"choice":"custom","lines":["merged"]}]"#,
        )
        .expect("every documented choice parses");
        assert_eq!(
            parsed,
            vec![
                (1, Resolution::Take(ConflictSide::Ours)),
                (2, Resolution::Take(ConflictSide::Theirs)),
                (3, Resolution::Union),
                (4, Resolution::Custom(vec!["merged".to_string()])),
            ]
        );

        let unknown = parse_hunk_resolutions(r#"[{"hunk":1,"choice":"whatever"}]"#).unwrap_err();
        assert!(unknown.contains("unknown choice"));
        let missing_lines =
            parse_hunk_resolutions(r#"[{"hunk":1,"choice":"custom"}]"#).unwrap_err();
        assert!(missing_lines.contains("no lines"));
        assert!(parse_hunk_resolutions("[]").unwrap_err().contains("empty"));
    }

    #[tokio::test]
    async fn resolve_conflict_refuses_an_absolute_path_before_touching_the_repository() {
        let workspace = tempfile::tempdir().expect("workspace");
        let args = HashMap::from([
            (
                "path".to_string(),
                workspace.path().join("a.rs").display().to_string(),
            ),
            (
                "resolutions".to_string(),
                r#"[{"hunk":1,"choice":"ours"}]"#.to_string(),
            ),
        ]);
        let result = execute_resolve_conflict(&args, Some(workspace.path()), false, None)
            .await
            .expect("refusal");
        assert!(!result.success);
        assert!(result.output.contains("relative to the repository root"));
    }

    #[tokio::test]
    async fn an_untrusted_workspace_blocks_a_shell_command_with_no_approver() {
        let workspace = tempfile::tempdir().expect("workspace");
        let call = ToolCall {
            name: "run_command".to_string(),
            args: HashMap::from([("command".to_string(), "printf untrusted".to_string())]),
        };
        let opts = ToolExecOptions {
            mcp_tool_definitions: None,
            require_confirmation: false,
            auto_approve_safe: true,
            auto_approve_edits: true,
            quiet: true,
            approval_callback: None,
            privacy_mode: crate::agent::PrivacyMode::Local,
            workspace_root: Some(workspace.path().to_path_buf()),
        };

        let result = execute_tool_with_opts(&call, &opts)
            .await
            .expect("trust gate result");
        assert!(!result.success);
        assert!(
            result.output.contains("is not trusted"),
            "auto-approval must not waive the trust gate: {}",
            result.output
        );
    }

    #[tokio::test]
    async fn one_command_is_never_approved_twice_for_two_boundaries() {
        let workspace = tempfile::tempdir().expect("workspace");
        let args = HashMap::from([("command".to_string(), "printf hi".to_string())]);
        assert!(
            untrusted_shell_refusal("run_command", &args, workspace.path(), None, true)
                .await
                .is_none(),
            "an approval already given for this call satisfies the trust gate"
        );
    }

    #[tokio::test]
    async fn an_untrusted_workspace_asks_before_running_a_shell_command() {
        let workspace = tempfile::tempdir().expect("workspace");
        let seen = std::sync::Arc::new(std::sync::Mutex::new(None));
        let seen_for_callback = seen.clone();
        let callback: ApprovalCallback = std::sync::Arc::new(move |request| {
            let seen_for_callback = seen_for_callback.clone();
            Box::pin(async move {
                *seen_for_callback.lock().expect("seen lock") = Some(request.kind);
                ApprovalDecision::Deny
            })
        });
        let call = ToolCall {
            name: "run_command".to_string(),
            args: HashMap::from([("command".to_string(), "printf untrusted".to_string())]),
        };
        let opts = ToolExecOptions {
            mcp_tool_definitions: None,
            require_confirmation: false,
            auto_approve_safe: true,
            auto_approve_edits: false,
            quiet: true,
            approval_callback: Some(callback),
            privacy_mode: crate::agent::PrivacyMode::Local,
            workspace_root: Some(workspace.path().to_path_buf()),
        };

        let result = execute_tool_with_opts(&call, &opts)
            .await
            .expect("trust gate result");
        assert!(!result.success);
        assert!(matches!(
            seen.lock().expect("seen lock").as_ref(),
            Some(ApprovalRequestKind::Exec { command }) if command == "printf untrusted"
        ));
    }

    fn dispatched_tool_names_from_source() -> BTreeSet<String> {
        let source = include_str!("mod.rs");
        let start = source
            .find("let result = match canonical_name {")
            .expect("execute_tool_with_opts dispatch match should exist");
        let body = &source[start..];
        let end = body
            .find("_ => Ok(unknown_tool_result")
            .expect("execute_tool_with_opts dispatch fallback should exist");

        body[..end]
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim_start();
                let rest = trimmed.strip_prefix('"')?;
                let (name, after_name) = rest.split_once('"')?;
                if after_name.trim_start().starts_with("=>") {
                    Some(name.to_string())
                } else {
                    None
                }
            })
            .collect()
    }

    #[test]
    fn catalog_builtin_tools_have_runtime_dispatch() {
        let catalog_names: BTreeSet<String> =
            crate::runtime::tool_catalog::all_builtin_tool_definitions()
                .into_iter()
                .map(|tool| tool.name)
                .collect();
        let mut dispatched_names = dispatched_tool_names_from_source();
        // Read-only tools dispatch through the C1 Tool-trait registry rather than a
        // source match arm, so include the registry's names as dispatched too.
        dispatched_names.extend(super::build_read_only_registry().names().map(String::from));
        // The git family dispatches off its spec table rather than one arm per
        // name. `every_git_tool_in_the_catalog_reaches_the_git_executor` is what
        // proves each of them actually arrives somewhere.
        dispatched_names.extend(
            crate::runtime::git_tools::git_tool_specs()
                .iter()
                .map(|spec| spec.name.to_string()),
        );
        let agent_runtime_tools = BTreeSet::from(["task".to_string(), "update_plan".to_string()]);

        for dispatched_name in &dispatched_names {
            assert!(
                catalog_names.contains(dispatched_name),
                "{dispatched_name} has a runtime dispatcher but no tool catalog entry"
            );
        }

        for catalog_name in &catalog_names {
            assert!(
                dispatched_names.contains(catalog_name)
                    || agent_runtime_tools.contains(catalog_name),
                "{catalog_name} has a tool catalog entry but no runtime dispatcher"
            );
        }
    }

    /// Every git tool the catalog advertises reaches the git executor. A name
    /// the dispatch does not recognise comes back as the unknown-tool reply,
    /// which is what this would catch.
    #[tokio::test]
    async fn every_git_tool_in_the_catalog_reaches_the_git_executor() {
        let workspace = tempfile::tempdir().expect("workspace");
        let opts = ToolExecOptions {
            mcp_tool_definitions: None,
            require_confirmation: false,
            auto_approve_safe: false,
            auto_approve_edits: false,
            quiet: true,
            approval_callback: None,
            privacy_mode: crate::agent::PrivacyMode::Byok,
            workspace_root: Some(workspace.path().to_path_buf()),
        };

        for spec in crate::runtime::git_tools::git_tool_specs() {
            let call = ToolCall {
                name: spec.name.to_string(),
                args: HashMap::new(),
            };
            let result = execute_tool_with_opts(&call, &opts)
                .await
                .unwrap_or_else(|error| panic!("{} dispatch: {error}", spec.name));
            assert_eq!(result.tool_name, spec.name);
            assert!(
                !result.output.contains("Unknown tool"),
                "{} has a catalog entry that reaches nothing: {}",
                spec.name,
                result.output
            );
        }
    }

    #[test]
    fn test_tool_size_cap_per_tool() {
        assert_eq!(tool_size_cap("read_file"), 100_000);
        assert_eq!(tool_size_cap("web_fetch"), 200_000);
        assert_eq!(tool_size_cap("web_search"), 100_000);
        assert_eq!(tool_size_cap("run_command"), 50_000);
        assert_eq!(tool_size_cap("powershell"), 50_000);
        assert_eq!(tool_size_cap("list_directory"), 20_000);
        assert_eq!(tool_size_cap("write_file"), 5_000);
        assert_eq!(tool_size_cap("multiedit"), 5_000);
        assert_eq!(tool_size_cap("notebook_edit"), 5_000);
        assert_eq!(tool_size_cap("unknown_tool"), MAX_OUTPUT_BYTES);
    }

    #[test]
    fn auto_approve_safe_uses_catalog_read_only_metadata() {
        assert!(is_catalog_read_only_tool("read_file"));
        assert!(is_catalog_read_only_tool("Read"));
        assert!(is_catalog_read_only_tool("Grep"));
        assert!(is_catalog_read_only_tool("lsp_hover"));
        assert!(is_catalog_read_only_tool("read_many_files"));
        assert!(!is_catalog_read_only_tool("write_file"));
        assert!(!is_catalog_read_only_tool("Write"));
        assert!(!is_catalog_read_only_tool("notebook_edit"));
    }

    #[test]
    fn reading_the_users_own_browser_is_never_pre_approved() {
        use crate::platform::runtime::tool_catalog::{
            browser_tool_definitions, reads_a_private_surface,
        };

        // The two browser reads declare themselves read-only, and today they
        // escape pre-approval only because the catalog this reads does not
        // carry the browser family at all. That is an accident of assembly, not
        // a decision: fold the families together, a reasonable tidy-up, and
        // both would start reading the user's signed-in browser unattended.
        let read_only_browser_tools: Vec<String> = browser_tool_definitions()
            .into_iter()
            .filter(|tool| tool.is_read_only)
            .map(|tool| tool.name)
            .collect();
        assert_eq!(
            read_only_browser_tools,
            vec!["browser_read_page", "browser_screenshot"]
        );
        for tool in &read_only_browser_tools {
            assert!(reads_a_private_surface(tool), "{tool} must still ask");
            assert!(
                !is_catalog_read_only_tool(tool),
                "{tool} is not pre-approved"
            );
        }

        // The workspace-bounded reads keep running without a prompt.
        for tool in ["read_file", "Read", "Grep", "lsp_hover", "read_many_files"] {
            assert!(is_catalog_read_only_tool(tool), "{tool} stays pre-approved");
            assert!(!reads_a_private_surface(tool), "{tool} should not ask");
        }
    }

    #[test]
    fn claude_style_tool_names_are_canonicalized() {
        assert_eq!(canonical_tool_name("Read"), "read_file");
        assert_eq!(canonical_tool_name("Bash"), "run_command");
        assert_eq!(canonical_tool_name("Grep"), "grep_files");
        assert_eq!(canonical_tool_name("Glob"), "glob");
        assert_eq!(canonical_tool_name("TodoWrite"), "todo_write");
        assert_eq!(canonical_tool_name("unknown_tool"), "unknown_tool");
    }

    #[test]
    fn executor_canonicalization_matches_catalog_aliases() {
        let mut definitions = crate::runtime::tool_catalog::all_builtin_tool_definitions();
        definitions.extend(crate::runtime::tool_catalog::team_tool_definitions());

        for tool in definitions {
            assert_eq!(canonical_tool_name(&tool.name), tool.name);

            for alias in crate::runtime::tool_catalog::tool_aliases(&tool.name) {
                assert_eq!(
                    canonical_tool_name(alias),
                    tool.name,
                    "{alias} should execute through {}",
                    tool.name
                );
            }
        }
    }

    #[tokio::test]
    async fn batch_accepts_public_calls_schema() {
        let mut args = HashMap::new();
        args.insert(
            "calls".to_string(),
            serde_json::json!([
                {
                    "name": "list_directory",
                    "args": { "path": "." }
                }
            ])
            .to_string(),
        );
        let call = ToolCall {
            name: "batch".into(),
            args,
        };
        let opts = ToolExecOptions {
            mcp_tool_definitions: None,
            require_confirmation: false,
            auto_approve_safe: true,
            auto_approve_edits: false,
            quiet: true,
            approval_callback: None,
            privacy_mode: crate::agent::PrivacyMode::Local,
            workspace_root: std::env::current_dir().ok(),
        };

        let result = execute_batch(&call, &opts).await.unwrap();

        assert!(result.success, "batch should succeed: {}", result.output);
        assert!(result.output.contains("list_directory"));
    }

    #[tokio::test]
    async fn notebook_edit_requires_read_state_for_existing_file() {
        let tmp = tempfile::tempdir_in(".").expect("tempdir");
        let path = tmp.path().join("notebook.ipynb");
        std::fs::write(
            &path,
            r#"{"cells":[{"cell_type":"markdown","source":["alpha"],"metadata":{}}],"metadata":{},"nbformat":4,"nbformat_minor":5}"#,
        )
        .expect("write notebook");

        let mut args = HashMap::new();
        args.insert("path".to_string(), path.display().to_string());
        args.insert("mode".to_string(), "delete".to_string());
        args.insert("index".to_string(), "0".to_string());

        let result = execute_notebook_edit(&args, false).await.unwrap();

        assert!(!result.success);
        assert!(result.output.contains("File has not been read yet"));
    }

    #[test]
    fn test_truncate_respects_per_tool_cap() {
        let big_output: String = (0..1000)
            .map(|i| format!("line {} {}", i, "x".repeat(70)))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(big_output.len() > 50_000 && big_output.len() < 100_000);

        let truncated = truncate_output_with_save("run_command", big_output.clone());
        assert!(
            truncated.len() < big_output.len(),
            "run_command should truncate {}-byte output (cap=50K), got {} bytes back",
            big_output.len(),
            truncated.len()
        );

        let unchanged = truncate_output_with_save("web_fetch", big_output.clone());
        assert_eq!(
            unchanged.len(),
            big_output.len(),
            "web_fetch should not truncate {}-byte output (cap=200K)",
            big_output.len()
        );
    }

    #[test]
    fn test_is_dangerous_command() {
        assert!(is_dangerous_command("sudo apt install foo"));
        assert!(is_dangerous_command("kill -9 1234"));
        assert!(is_dangerous_command("/usr/bin/sudo rm foo"));
        assert!(is_dangerous_command("echo hello | sudo rm foo"));

        assert!(!is_dangerous_command("ls -la"));
        assert!(!is_dangerous_command("cat /etc/hosts"));
        assert!(!is_dangerous_command("echo hello"));
        assert!(!is_dangerous_command("grep -rn pattern ."));
        assert!(!is_dangerous_command("pwd"));
    }

    #[test]
    fn test_truncate_output_short_passthrough() {
        let short = "hello world".to_string();
        assert_eq!(truncate_output_with_save("test", short.clone()), short);
    }

    #[test]
    fn test_truncate_output_over_max_lines() {
        let line_count = MAX_OUTPUT_LINES + 100;
        let lines: Vec<String> = (0..line_count).map(|i| format!("line {}", i)).collect();
        let input = lines.join("\n");

        let truncated = truncate_output_with_save("test", input);

        assert!(truncated.contains("[..."));
        assert!(truncated.contains("lines omitted"));

        assert!(truncated.contains("line 0"));
        assert!(truncated.contains(&format!("line {}", line_count - 1)));

        let mid = line_count / 2;
        assert!(!truncated.contains(&format!("line {}\n", mid)));
    }

    #[test]
    fn test_truncate_output_over_max_bytes() {
        let big_line = "x".repeat(1024);
        let line_count = 100;
        let lines: Vec<String> = (0..line_count)
            .map(|i| format!("{}: {}", i, big_line))
            .collect();
        let input = lines.join("\n");
        assert!(input.len() > MAX_OUTPUT_BYTES);

        let truncated = truncate_output_with_save("test", input);
        assert!(truncated.contains("[..."));
        assert!(truncated.contains("lines omitted"));
    }

    #[test]
    fn test_truncate_output_omitted_count_correct() {
        let line_count = 200;
        let lines: Vec<String> = (0..line_count).map(|i| format!("line {}", i)).collect();

        let truncated = truncate_by_lines(&lines.iter().map(|s| s.as_str()).collect::<Vec<&str>>());
        let expected_omitted = line_count - TRUNCATION_HEAD_LINES - TRUNCATION_TAIL_LINES;
        assert!(truncated.contains(&format!("[... {} lines omitted ...]", expected_omitted)));
    }

    #[test]
    fn test_truncate_by_lines_short_passthrough() {
        let lines = vec!["a", "b", "c"];
        assert_eq!(truncate_by_lines(&lines), "a\nb\nc");
    }

    #[test]
    fn test_truncate_by_lines_exact_boundary() {
        let total = TRUNCATION_HEAD_LINES + TRUNCATION_TAIL_LINES;
        let lines: Vec<String> = (0..total).map(|i| format!("line {}", i)).collect();
        let refs: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();

        let result = truncate_by_lines(&refs);
        assert!(!result.contains("omitted"));
        assert_eq!(result.lines().count(), total);
    }

    #[test]
    fn test_truncate_by_lines_one_over_boundary() {
        let total = TRUNCATION_HEAD_LINES + TRUNCATION_TAIL_LINES + 1;
        let lines: Vec<String> = (0..total).map(|i| format!("line {}", i)).collect();
        let refs: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();

        let result = truncate_by_lines(&refs);
        assert!(result.contains("[... 1 lines omitted ...]"));
    }

    #[test]
    fn test_format_size() {
        assert_eq!(format_size(0), "0B");
        assert_eq!(format_size(500), "500B");
        assert_eq!(format_size(1024), "1.0K");
        assert_eq!(format_size(1024 * 1024), "1.0M");
        assert_eq!(format_size(1024 * 1024 * 1024), "1.0G");
    }

    #[tokio::test]
    async fn test_read_file_missing_path() {
        let args = HashMap::new();
        let result = execute_read_file(&args).await.unwrap();
        assert!(!result.success);
        assert!(result.output.contains("Missing required argument"));
    }

    /// A missing path must be distinguishable from a failed read, and must name
    /// the way to find the real one.
    #[tokio::test]
    async fn test_read_file_not_found() {
        let tmp = tempfile::tempdir_in(".").unwrap();
        let missing = tmp.path().join("missing.txt");

        let mut args = HashMap::new();
        args.insert("path".to_string(), missing.display().to_string());
        let result = execute_read_file(&args).await.unwrap();
        assert!(!result.success);
        assert!(
            result.output.starts_with("Path does not exist:"),
            "unexpected output: {}",
            result.output
        );
        assert!(
            result.output.contains("glob") || result.output.contains("Did you mean"),
            "a missing path must be actionable: {}",
            result.output
        );
    }

    /// With a near miss on disk, the existing sibling is what the refusal names.
    #[tokio::test]
    async fn a_missing_path_names_the_sibling_that_exists() {
        let tmp = tempfile::tempdir_in(".").unwrap();
        std::fs::write(tmp.path().join("router.ts"), "export {}").unwrap();

        let mut args = HashMap::new();
        args.insert(
            "path".to_string(),
            tmp.path().join("routes.ts").display().to_string(),
        );
        let result = execute_read_file(&args).await.unwrap();

        assert!(!result.success);
        assert!(
            result.output.contains("router.ts"),
            "unexpected output: {}",
            result.output
        );
    }

    #[test]
    fn test_diff_identical_content() {
        let text = "line 1\nline 2\nline 3";
        let diff = generate_simple_diff(text, text);
        for line in diff.lines() {
            assert!(
                line.starts_with(' '),
                "expected context line, got: {}",
                line
            );
        }
        assert_eq!(diff.lines().count(), 3);
    }

    #[test]
    fn test_diff_empty_to_content() {
        let diff = generate_simple_diff("", "hello\nworld");
        assert_eq!(diff, "+hello\n+world");
    }

    #[test]
    fn test_diff_content_to_empty() {
        let diff = generate_simple_diff("hello\nworld", "");
        assert_eq!(diff, "-hello\n-world");
    }

    #[test]
    fn test_diff_both_empty() {
        let diff = generate_simple_diff("", "");
        assert_eq!(diff, "");
    }

    #[test]
    fn test_diff_single_line_change() {
        let old = "aaa\nbbb\nccc";
        let new = "aaa\nBBB\nccc";
        let diff = generate_simple_diff(old, new);
        let lines: Vec<&str> = diff.lines().collect();
        assert_eq!(lines.len(), 4);
        assert_eq!(lines[0], " aaa");
        assert_eq!(lines[1], "-bbb");
        assert_eq!(lines[2], "+BBB");
        assert_eq!(lines[3], " ccc");
    }

    #[test]
    fn test_diff_addition_in_middle() {
        let old = "first\nlast";
        let new = "first\nmiddle\nlast";
        let diff = generate_simple_diff(old, new);
        let lines: Vec<&str> = diff.lines().collect();
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0], " first");
        assert_eq!(lines[1], "+middle");
        assert_eq!(lines[2], " last");
    }

    #[test]
    fn test_diff_removal_in_middle() {
        let old = "first\nmiddle\nlast";
        let new = "first\nlast";
        let diff = generate_simple_diff(old, new);
        let lines: Vec<&str> = diff.lines().collect();
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0], " first");
        assert_eq!(lines[1], "-middle");
        assert_eq!(lines[2], " last");
    }

    #[test]
    fn test_diff_complete_rewrite() {
        let old = "old line 1\nold line 2";
        let new = "new line A\nnew line B";
        let diff = generate_simple_diff(old, new);
        let lines: Vec<&str> = diff.lines().collect();
        assert_eq!(lines.len(), 4);
        assert!(lines.iter().filter(|l| l.starts_with('-')).count() == 2);
        assert!(lines.iter().filter(|l| l.starts_with('+')).count() == 2);
    }

    #[test]
    fn test_diff_multiline_mixed_changes() {
        let old = "alpha\nbeta\ngamma\ndelta\nepsilon";
        let new = "alpha\nBETA\ngamma\nepsilon\nzeta";
        let diff = generate_simple_diff(old, new);
        let lines: Vec<&str> = diff.lines().collect();

        assert_eq!(lines[0], " alpha");
        assert!(lines.contains(&"-beta"));
        assert!(lines.contains(&"+BETA"));
        assert!(lines.contains(&"-delta"));
        assert!(lines.contains(&"+zeta"));
    }

    #[tokio::test]
    async fn test_read_file_start_line() {
        let tmp = tempfile::NamedTempFile::new_in(".").unwrap();
        let content = (1..=10)
            .map(|i| format!("line {}", i))
            .collect::<Vec<_>>()
            .join("\n");
        std::fs::write(tmp.path(), &content).unwrap();

        let mut args = HashMap::new();
        args.insert("path".to_string(), tmp.path().display().to_string());
        args.insert("start_line".to_string(), "5".to_string());

        let result = execute_read_file(&args).await.unwrap();
        assert!(result.success);
        assert!(result.output.contains("line 5"));
        assert!(result.output.contains("line 10"));
        assert!(!result.output.contains("\tline 4\n"));
    }

    #[tokio::test]
    async fn test_read_file_end_line() {
        let tmp = tempfile::NamedTempFile::new_in(".").unwrap();
        let content = (1..=10)
            .map(|i| format!("line {}", i))
            .collect::<Vec<_>>()
            .join("\n");
        std::fs::write(tmp.path(), &content).unwrap();

        let mut args = HashMap::new();
        args.insert("path".to_string(), tmp.path().display().to_string());
        args.insert("end_line".to_string(), "3".to_string());

        let result = execute_read_file(&args).await.unwrap();
        assert!(result.success);
        assert!(result.output.contains("line 1"));
        assert!(result.output.contains("line 3"));
        assert!(!result.output.contains("\tline 4\n"));
    }

    #[tokio::test]
    async fn test_read_file_start_and_end_line() {
        let tmp = tempfile::NamedTempFile::new_in(".").unwrap();
        let content = (1..=20)
            .map(|i| format!("line {}", i))
            .collect::<Vec<_>>()
            .join("\n");
        std::fs::write(tmp.path(), &content).unwrap();

        let mut args = HashMap::new();
        args.insert("path".to_string(), tmp.path().display().to_string());
        args.insert("start_line".to_string(), "5".to_string());
        args.insert("end_line".to_string(), "10".to_string());

        let result = execute_read_file(&args).await.unwrap();
        assert!(result.success);
        assert!(result.output.contains("line 5"));
        assert!(result.output.contains("line 10"));
        assert!(result.output.contains("[lines 5-10 of 20 total]"));
        assert!(result
            .output
            .contains("To read more, call read_file with start_line: 11"));
    }

    #[tokio::test]
    async fn test_read_file_empty_range() {
        let tmp = tempfile::NamedTempFile::new_in(".").unwrap();
        let content = "line 1\nline 2\nline 3";
        std::fs::write(tmp.path(), content).unwrap();

        let mut args = HashMap::new();
        args.insert("path".to_string(), tmp.path().display().to_string());
        args.insert("start_line".to_string(), "10".to_string());
        args.insert("end_line".to_string(), "5".to_string());

        let result = execute_read_file(&args).await.unwrap();
        assert!(result.success);
        assert!(result.output.contains("empty range"));
    }

    #[test]
    fn test_truncate_line_short() {
        let line = "short line";
        assert_eq!(truncate_line(line), "short line");
    }

    #[test]
    fn test_truncate_line_long() {
        let line = "x".repeat(MAX_LINE_LENGTH + 500);
        let result = truncate_line(&line);
        assert!(result.ends_with("... [truncated]"));
        assert!(result.len() < line.len());
    }

    #[test]
    fn test_truncate_line_exact_boundary() {
        let line = "y".repeat(MAX_LINE_LENGTH);
        assert_eq!(truncate_line(&line), line);
    }

    #[tokio::test]
    async fn test_web_search_missing_query() {
        let args = HashMap::new();
        let result = execute_web_search(&args).await.unwrap();
        assert!(!result.success);
        assert!(result.output.contains("Missing required argument: query"));
    }

    #[tokio::test]
    async fn test_web_search_no_api_key() {
        std::env::remove_var("SEARCH_API_KEY");

        let mut args = HashMap::new();
        args.insert("query".to_string(), "test query".to_string());
        let result = execute_web_search(&args).await.unwrap();
        assert!(!result.success);
        assert!(result.output.contains("Web search not configured"));
    }

    #[tokio::test]
    async fn test_web_fetch_missing_url() {
        let args = HashMap::new();
        let result = execute_web_fetch(&args).await.unwrap();
        assert!(!result.success);
        assert!(result.output.contains("Missing required argument: url"));
    }

    #[tokio::test]
    async fn test_web_fetch_invalid_url() {
        let mut args = HashMap::new();
        args.insert("url".to_string(), "not-a-valid-url".to_string());
        let result = execute_web_fetch(&args).await.unwrap();
        assert!(!result.success);
        assert!(
            result.output.contains("Failed to fetch")
                || result.output.contains("URL blocked")
                || result.output.contains("Invalid URL"),
            "Expected error message, got: {}",
            result.output
        );
    }

    #[test]
    fn test_strip_html_tags_basic() {
        use web::strip_html_tags_pub;
        let html = "<p>Hello <b>world</b></p>";
        assert_eq!(strip_html_tags_pub(html), "Hello world");
    }

    #[test]
    fn test_strip_html_tags_empty() {
        use web::strip_html_tags_pub;
        assert_eq!(strip_html_tags_pub(""), "");
    }

    #[test]
    fn test_strip_html_tags_no_tags() {
        use web::strip_html_tags_pub;
        assert_eq!(strip_html_tags_pub("plain text"), "plain text");
    }

    #[test]
    fn test_strip_html_tags_nested() {
        use web::strip_html_tags_pub;
        let html = "<div><p>nested <span>content</span></p></div>";
        assert_eq!(strip_html_tags_pub(html), "nested content");
    }

    #[test]
    fn test_max_file_lines_is_2000() {
        assert_eq!(MAX_FILE_LINES, 2000);
    }

    #[test]
    fn test_max_line_length_is_2000() {
        assert_eq!(MAX_LINE_LENGTH, 2000);
    }
}

#[cfg(test)]
mod path_validation_regressions {
    use super::*;

    fn args(pairs: &[(&str, &str)]) -> std::collections::HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[tokio::test]
    async fn read_many_files_refuses_paths_outside_project() {
        let payload = serde_json::to_string(&vec!["/etc/hosts", "/etc/shadow"]).unwrap();
        let result = execute_read_many_files(&args(&[("paths", &payload)]))
            .await
            .expect("tool execution should not error out");

        assert!(
            result.output.contains("Refusing to read outside project"),
            "expected per-path rejection message, got: {}",
            result.output
        );
        assert!(
            !result.success,
            "tool should report failure when no path could be read"
        );
    }

    #[tokio::test]
    async fn glob_refuses_absolute_pattern() {
        let result = execute_glob(&args(&[("pattern", "/etc/*.conf")]))
            .await
            .expect("tool should return ToolResult, not error");
        assert!(
            result.output.contains("Refusing absolute glob pattern"),
            "expected absolute-pattern rejection, got: {}",
            result.output
        );
        assert!(!result.success);
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn glob_refuses_windows_rooted_and_prefixed_patterns() {
        for pattern in [
            r"\outside\*.txt",
            r"C:*.txt",
            r"C:\outside\*.txt",
            r"\\server\share\*.txt",
            r"\\?\C:\outside\*.txt",
        ] {
            let result = execute_glob(&args(&[("pattern", pattern)])).await.unwrap();
            assert!(!result.success, "accepted {pattern}");
            assert!(
                result.output.contains("Refusing absolute glob pattern"),
                "{}",
                result.output
            );
        }
    }

    #[tokio::test]
    async fn glob_matches_a_project_relative_pattern() {
        let directory = tempfile::tempdir_in(".").unwrap();
        let file = directory.path().join("example.txt");
        std::fs::write(&file, "fixture").unwrap();
        let base = directory.path().to_string_lossy();
        let result = execute_glob(&args(&[("pattern", "*.txt"), ("path", &base)]))
            .await
            .unwrap();
        assert!(result.success, "{}", result.output);
        assert!(result.output.contains("example.txt"), "{}", result.output);
    }

    #[tokio::test]
    async fn glob_refuses_outside_base_path() {
        let result = execute_glob(&args(&[("pattern", "*.txt"), ("path", "/etc")]))
            .await
            .expect("tool should return ToolResult");
        assert!(
            result.output.contains("Refusing to glob outside project"),
            "expected base-path rejection, got: {}",
            result.output
        );
    }

    #[tokio::test]
    async fn list_directory_refuses_filesystem_root() {
        let result = execute_list_directory(&args(&[("path", "/etc")]))
            .await
            .expect("tool should return ToolResult");
        assert!(
            result.output.contains("Refusing to list outside project"),
            "expected list_directory containment, got: {}",
            result.output
        );
        assert!(!result.success);
    }

    #[tokio::test]
    async fn list_directory_allows_project_relative_paths() {
        let result = execute_list_directory(&args(&[("path", ".")]))
            .await
            .expect("tool should return ToolResult");
        assert!(
            !result.output.contains("Refusing to list outside project"),
            "in-project path was wrongly refused: {}",
            result.output
        );
    }
}

#[cfg(test)]
mod private_ip_classifier_tests {
    use super::is_private_or_internal_ip;
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

    fn v4(a: u8, b: u8, c: u8, d: u8) -> IpAddr {
        IpAddr::V4(Ipv4Addr::new(a, b, c, d))
    }

    #[test]
    fn rejects_aws_imds_169_254() {
        assert!(is_private_or_internal_ip(&v4(169, 254, 169, 254)));
    }

    #[test]
    fn rejects_rfc1918_ranges() {
        assert!(is_private_or_internal_ip(&v4(10, 0, 0, 1)));
        assert!(is_private_or_internal_ip(&v4(172, 16, 0, 1)));
        assert!(is_private_or_internal_ip(&v4(172, 31, 255, 254)));
        assert!(is_private_or_internal_ip(&v4(192, 168, 1, 1)));
    }

    #[test]
    fn allows_172_32_public_range() {
        assert!(!is_private_or_internal_ip(&v4(172, 32, 0, 1)));
    }

    #[test]
    fn rejects_loopback_and_unspecified() {
        assert!(is_private_or_internal_ip(&v4(127, 0, 0, 1)));
        assert!(is_private_or_internal_ip(&v4(0, 0, 0, 0)));
    }

    #[test]
    fn rejects_cgnat_100_64() {
        assert!(is_private_or_internal_ip(&v4(100, 64, 0, 1)));
        assert!(is_private_or_internal_ip(&v4(100, 127, 255, 254)));
        assert!(!is_private_or_internal_ip(&v4(100, 128, 0, 1)));
        assert!(!is_private_or_internal_ip(&v4(100, 63, 255, 254)));
    }

    #[test]
    fn rejects_multicast_and_reserved() {
        assert!(is_private_or_internal_ip(&v4(224, 0, 0, 1)));
        assert!(is_private_or_internal_ip(&v4(255, 255, 255, 255)));
    }

    #[test]
    fn allows_normal_public_v4() {
        assert!(!is_private_or_internal_ip(&v4(8, 8, 8, 8)));
        assert!(!is_private_or_internal_ip(&v4(1, 1, 1, 1)));
        assert!(!is_private_or_internal_ip(&v4(140, 82, 121, 4)));
    }

    #[test]
    fn rejects_v6_loopback_and_link_local() {
        assert!(is_private_or_internal_ip(&IpAddr::V6(Ipv6Addr::LOCALHOST)));
        assert!(is_private_or_internal_ip(&IpAddr::V6(
            Ipv6Addr::UNSPECIFIED
        )));
        assert!(is_private_or_internal_ip(&IpAddr::V6(
            "fe80::1".parse().unwrap()
        )));
        assert!(is_private_or_internal_ip(&IpAddr::V6(
            "fc00::1".parse().unwrap()
        )));
    }

    #[test]
    fn rejects_v4_mapped_v6_of_private_v4() {
        assert!(is_private_or_internal_ip(&IpAddr::V6(
            "::ffff:127.0.0.1".parse().unwrap()
        )));
        assert!(is_private_or_internal_ip(&IpAddr::V6(
            "::ffff:169.254.169.254".parse().unwrap()
        )));
        assert!(is_private_or_internal_ip(&IpAddr::V6(
            "::ffff:10.0.0.1".parse().unwrap()
        )));
    }

    #[test]
    fn allows_normal_public_v6() {
        assert!(!is_private_or_internal_ip(&IpAddr::V6(
            "2001:4860:4860::8888".parse().unwrap()
        )));
    }

    // ── C1 Tool-trait registry ──────────────────────────────────────────────
    #[test]
    fn read_only_registry_registers_the_read_only_cluster() {
        let reg = super::build_read_only_registry();
        assert_eq!(reg.len(), 6);
        for name in [
            "read_file",
            "search_files",
            "list_directory",
            "glob",
            "grep_files",
            "skill",
        ] {
            let tool = reg.get(name).unwrap_or_else(|| panic!("missing {name}"));
            assert_eq!(tool.name(), name);
            assert!(tool.read_only(), "{name} must be read-only");
        }
    }

    #[test]
    fn read_only_registry_excludes_mutating_tools() {
        // Mutating tools (write/run/edit) are NOT in the read-only registry, they
        // must keep flowing through the confirmation-aware dispatch match.
        let reg = super::build_read_only_registry();
        assert!(reg.get("write_file").is_none());
        assert!(reg.get("run_command").is_none());
        assert!(reg.get("edit_file").is_none());
    }
}
