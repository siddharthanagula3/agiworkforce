use std::collections::HashMap;

use anyhow::Result;
use dialoguer::Confirm;

use super::common::describe_command;
use super::{approval_allows, request_approval, ApprovalCallback, ToolResult};
use crate::tui::approval_broker::{ApprovalDecision, ApprovalRequest, ApprovalRequestKind};

async fn worktree_approval_denial(
    tool_name: &str,
    prompt: &str,
    permission_command: &str,
    require_confirmation: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> Option<ToolResult> {
    if !require_confirmation {
        return None;
    }

    let perms = crate::permissions::PermissionStore::load().unwrap_or_default();
    match perms.check_command(permission_command) {
        Some(true) => None,
        Some(false) => Some(ToolResult {
            tool_name: tool_name.to_string(),
            success: false,
            output: format!(
                "Worktree action is denied by saved permissions. Use /permissions reset to clear.\n{}",
                describe_command(permission_command)
            ),
        }),
        None => {
            if let Some(decision) = request_approval(
                approval_callback,
                ApprovalRequest::new(
                    ApprovalRequestKind::Exec {
                        command: permission_command.to_string(),
                    },
                    prompt,
                    vec![describe_command(permission_command)],
                ),
            )
            .await
            {
                if !approval_allows(decision) {
                    return Some(ToolResult {
                        tool_name: tool_name.to_string(),
                        success: false,
                        output: "User denied worktree action".to_string(),
                    });
                }

                let mut perms = crate::permissions::PermissionStore::load().unwrap_or_default();
                match decision {
                    ApprovalDecision::AllowSession => {
                        perms.allow_session_for_process(permission_command);
                    }
                    ApprovalDecision::AlwaysAllow => {
                        perms.allow_always(permission_command);
                        let _ = perms.save();
                    }
                    _ => {}
                }
                None
            } else {
                let confirmed = Confirm::new()
                    .with_prompt(prompt)
                    .default(false)
                    .interact()
                    .unwrap_or(false);

                if !confirmed {
                    return Some(ToolResult {
                        tool_name: tool_name.to_string(),
                        success: false,
                        output: "User denied worktree action".to_string(),
                    });
                }

                let mut perms = crate::permissions::PermissionStore::load().unwrap_or_default();
                perms.allow_session_for_process(permission_command);
                None
            }
        }
    }
}

pub(super) async fn execute_enter_worktree(
    args: &HashMap<String, String>,
    require_confirmation: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> Result<ToolResult> {
    let branch = match args.get("branch").filter(|s| !s.is_empty()) {
        Some(b) => b.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "enter_worktree".into(),
                success: false,
                output: "Missing required argument: branch".into(),
            });
        }
    };
    let base = args.get("base").cloned();
    let target_dir = args.get("target_dir").map(std::path::PathBuf::from);
    let permission_command = match &target_dir {
        Some(dir) => format!("git worktree add {} {}", dir.display(), branch),
        None => format!("git worktree add <auto-dir> {}", branch),
    };
    if let Some(denial) = worktree_approval_denial(
        "enter_worktree",
        "Create this git worktree?",
        &permission_command,
        require_confirmation,
        approval_callback,
    )
    .await
    {
        return Ok(denial);
    }

    let repo = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let opts = crate::runtime::worktree::WorktreeOptions {
        branch: branch.clone(),
        base,
        target_dir,
    };
    match crate::runtime::worktree::enter_worktree(&repo, opts).await {
        Ok(wt) => {
            let hcfg = crate::hooks::load_hooks().unwrap_or_default();
            crate::hooks::run_hooks(
                &hcfg,
                crate::hooks::HookEvent::WorktreeCreate,
                &crate::hooks::HookInput {
                    event: "WorktreeCreate".to_string(),
                    session_id: None,
                    model: None,
                    tool_name: Some("enter_worktree".to_string()),
                    tool_args: None,
                    tool_output: None,
                    message: Some(format!("branch={} path={}", wt.branch, wt.path.display())),
                    tool_execution: None,
                },
            )
            .await;
            Ok(ToolResult {
                tool_name: "enter_worktree".into(),
                success: true,
                output:
                    serde_json::json!({"branch": wt.branch, "path": wt.path.display().to_string()})
                        .to_string(),
            })
        }
        Err(e) => Ok(ToolResult {
            tool_name: "enter_worktree".into(),
            success: false,
            output: format!("enter_worktree failed: {e}"),
        }),
    }
}

pub(super) async fn execute_exit_worktree(
    args: &HashMap<String, String>,
    require_confirmation: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> Result<ToolResult> {
    let path = match args.get("path").filter(|s| !s.is_empty()) {
        Some(p) => std::path::PathBuf::from(p),
        None => {
            return Ok(ToolResult {
                tool_name: "exit_worktree".into(),
                success: false,
                output: "Missing required argument: path".into(),
            });
        }
    };
    let permission_command = format!("git worktree remove {}", path.display());
    if let Some(denial) = worktree_approval_denial(
        "exit_worktree",
        "Remove this git worktree?",
        &permission_command,
        require_confirmation,
        approval_callback,
    )
    .await
    {
        return Ok(denial);
    }

    let repo = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    match crate::runtime::worktree::exit_worktree(&repo, &path).await {
        Ok(()) => {
            let hcfg = crate::hooks::load_hooks().unwrap_or_default();
            crate::hooks::run_hooks(
                &hcfg,
                crate::hooks::HookEvent::WorktreeRemove,
                &crate::hooks::HookInput {
                    event: "WorktreeRemove".to_string(),
                    session_id: None,
                    model: None,
                    tool_name: Some("exit_worktree".to_string()),
                    tool_args: None,
                    tool_output: None,
                    message: Some(format!("path={}", path.display())),
                    tool_execution: None,
                },
            )
            .await;
            Ok(ToolResult {
                tool_name: "exit_worktree".into(),
                success: true,
                output: format!("Removed worktree at {}", path.display()),
            })
        }
        Err(e) => Ok(ToolResult {
            tool_name: "exit_worktree".into(),
            success: false,
            output: format!("exit_worktree failed: {e}"),
        }),
    }
}

pub(super) async fn execute_list_worktrees(_args: &HashMap<String, String>) -> Result<ToolResult> {
    let repo = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    match crate::runtime::worktree::list_worktrees(&repo).await {
        Ok(list) => {
            let entries: Vec<serde_json::Value> = list.iter().map(|w| {
                serde_json::json!({"branch": w.branch, "path": w.path.display().to_string()})
            }).collect();
            Ok(ToolResult {
                tool_name: "list_worktrees".into(),
                success: true,
                output: serde_json::json!({"worktrees": entries}).to_string(),
            })
        }
        Err(e) => Ok(ToolResult {
            tool_name: "list_worktrees".into(),
            success: false,
            output: format!("list_worktrees failed: {e}"),
        }),
    }
}
