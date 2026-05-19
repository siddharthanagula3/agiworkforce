use std::collections::HashMap;

use anyhow::Result;

use super::ToolResult;

pub(super) async fn execute_enter_worktree(args: &HashMap<String, String>) -> Result<ToolResult> {
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
    let repo = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let opts = crate::runtime::worktree::WorktreeOptions { branch, base, target_dir };
    match crate::runtime::worktree::enter_worktree(&repo, opts) {
        Ok(wt) => Ok(ToolResult {
            tool_name: "enter_worktree".into(),
            success: true,
            output: serde_json::json!({"branch": wt.branch, "path": wt.path.display().to_string()}).to_string(),
        }),
        Err(e) => Ok(ToolResult {
            tool_name: "enter_worktree".into(),
            success: false,
            output: format!("enter_worktree failed: {e}"),
        }),
    }
}

pub(super) async fn execute_exit_worktree(args: &HashMap<String, String>) -> Result<ToolResult> {
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
    let repo = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    match crate::runtime::worktree::exit_worktree(&repo, &path) {
        Ok(()) => Ok(ToolResult {
            tool_name: "exit_worktree".into(),
            success: true,
            output: format!("Removed worktree at {}", path.display()),
        }),
        Err(e) => Ok(ToolResult {
            tool_name: "exit_worktree".into(),
            success: false,
            output: format!("exit_worktree failed: {e}"),
        }),
    }
}

pub(super) async fn execute_list_worktrees(_args: &HashMap<String, String>) -> Result<ToolResult> {
    let repo = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    match crate::runtime::worktree::list_worktrees(&repo) {
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
