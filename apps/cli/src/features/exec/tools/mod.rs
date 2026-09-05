use std::collections::HashMap;
use std::future::Future;
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
use common::{describe_command, print_tool_status, truncate_output_with_save};
#[cfg(test)]
use common::{
    format_size, generate_simple_diff, is_dangerous_command, tool_size_cap, truncate_by_lines,
    truncate_line, MAX_FILE_LINES, MAX_LINE_LENGTH, MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES,
    TRUNCATION_HEAD_LINES, TRUNCATION_TAIL_LINES,
};
use dir_ops::{execute_glob, execute_grep_files, execute_list_directory, execute_search_files};
use file_ops::{
    execute_apply_patch, execute_multiedit, execute_read_file, execute_read_many_files,
    execute_write_file,
};
use git::{execute_enter_worktree, execute_exit_worktree, execute_list_worktrees};
use task_registry::{
    execute_advisor, execute_ask_user, execute_cron_create, execute_cron_delete, execute_cron_list,
    execute_lsp_completion, execute_lsp_definition, execute_lsp_diagnostics,
    execute_lsp_document_symbols, execute_lsp_format, execute_lsp_hover, execute_team_create,
    execute_team_delete, execute_todo_read, execute_todo_write,
};
#[cfg(test)]
use web::is_private_or_internal_ip;
use web::{execute_tool_search, execute_web_fetch, execute_web_search};

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
        require_confirmation,
        auto_approve_safe: false,
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
    if opts.privacy_mode == crate::agent::PrivacyMode::Local
        && matches!(canonical_name, "web_search" | "web_fetch" | "advisor")
    {
        return Ok(ToolResult {
            tool_name: canonical_name.to_string(),
            success: false,
            output: format!(
                "{canonical_name} is unavailable in Local privacy mode: network context must not leave this device. Create an explicit BYOK or Managed continuation to use this tool."
            ),
        });
    }

    let mut require_confirm = opts.require_confirmation
        && !(opts.auto_approve_safe && is_catalog_read_only_tool(canonical_name));
    if let Some(workspace_root) = opts.workspace_root.as_deref() {
        let policy = crate::platform::policy::PolicyEngine::load_workspace(workspace_root)?;
        if policy.has_rules() {
            let primary_argument = policy_primary_argument(canonical_name, &call.args);
            let decision = effective_workspace_policy_decision(
                policy.evaluate(canonical_name, &primary_argument),
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
                }
            }
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
        "web_search" => execute_web_search_with_opts(&call.args, opts.quiet).await,
        "web_fetch" => execute_web_fetch_with_opts(&call.args, opts.quiet).await,
        "apply_patch" => {
            execute_apply_patch(&call.args, require_confirm, opts.approval_callback.as_ref()).await
        }
        "tool_search" => execute_tool_search(&call.args).await,
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
        "todo_read" => execute_todo_read().await,
        "todo_write" => execute_todo_write(&call.args).await,
        "ask_user" => execute_ask_user(&call.args).await,
        "read_many_files" => execute_read_many_files(&call.args).await,
        "team_create" => execute_team_create(&call.args).await,
        "team_delete" => execute_team_delete(&call.args).await,
        "cron_create" => execute_cron_create(&call.args).await,
        "cron_delete" => execute_cron_delete(&call.args).await,
        "cron_list" => execute_cron_list(&call.args).await,
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
        _ => Ok(unknown_tool_result(&call.name)),
    };

    result
}

fn policy_primary_argument(tool_name: &str, args: &HashMap<String, String>) -> String {
    let preferred_keys: &[&str] = match tool_name {
        "run_command" | "powershell" => &["command"],
        "write_file" | "edit_file" | "notebook_edit" | "read_file" => &["path", "file_path"],
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

fn workspace_policy_is_trusted(workspace_root: &std::path::Path) -> bool {
    let project_root = crate::project_scope::resolve_project_scope(workspace_root);
    let Ok(config_dir) = crate::config::CliConfig::config_dir() else {
        return false;
    };
    let Ok(registry) = crate::project_registry::ProjectRegistry::load(&config_dir) else {
        return false;
    };
    let project_key = project_root.to_string_lossy();
    registry
        .projects
        .get(project_key.as_ref())
        .is_some_and(|entry| entry.trust_level == "trusted")
}

fn effective_workspace_policy_decision(
    decision: crate::platform::policy::PolicyDecision,
    workspace_is_trusted: bool,
) -> crate::platform::policy::PolicyDecision {
    use crate::platform::policy::PolicyDecision;

    match (decision, workspace_is_trusted) {
        // A repository-controlled file must not be able to remove an approval
        // boundary until the user has explicitly trusted that repository.
        (PolicyDecision::Allow, false) => PolicyDecision::Ask,
        (decision, _) => decision,
    }
}

pub(crate) async fn request_approval(
    approval_callback: Option<&ApprovalCallback>,
    request: ApprovalRequest,
) -> Option<ApprovalDecision> {
    let callback = approval_callback?;
    Some(callback(request).await)
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
        working_dir: args.get("working_dir").cloned(),
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
    use super::*;
    use std::collections::BTreeSet;

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
            require_confirmation: false,
            auto_approve_safe: true,
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
            require_confirmation: false,
            auto_approve_safe: true,
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
            require_confirmation: false,
            auto_approve_safe: true,
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
            require_confirmation: false,
            auto_approve_safe: true,
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
        use crate::platform::policy::PolicyDecision;

        assert_eq!(
            effective_workspace_policy_decision(PolicyDecision::Allow, false),
            PolicyDecision::Ask
        );
        assert_eq!(
            effective_workspace_policy_decision(PolicyDecision::Deny, false),
            PolicyDecision::Deny
        );
        assert_eq!(
            effective_workspace_policy_decision(PolicyDecision::Allow, true),
            PolicyDecision::Allow
        );
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
            require_confirmation: false,
            auto_approve_safe: true,
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

    #[tokio::test]
    async fn test_read_file_not_found() {
        let tmp = tempfile::tempdir_in(".").unwrap();
        let missing = tmp.path().join("missing.txt");

        let mut args = HashMap::new();
        args.insert("path".to_string(), missing.display().to_string());
        let result = execute_read_file(&args).await.unwrap();
        assert!(!result.success);
        assert!(
            result.output.contains("File not found"),
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
