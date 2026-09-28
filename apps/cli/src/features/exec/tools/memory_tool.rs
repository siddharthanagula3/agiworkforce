use std::collections::HashMap;

use anyhow::Result;

use super::{approval_allows, request_approval, ApprovalCallback, ToolResult};
use crate::memory::{MemoryManager, MemoryTier};
use crate::tui::approval_broker::{ApprovalRequest, ApprovalRequestKind};

const MAX_MEMORY_CHARS: usize = 1_000;

fn result(success: bool, output: impl Into<String>) -> ToolResult {
    ToolResult {
        tool_name: "memory".into(),
        success,
        output: output.into(),
    }
}

fn tier_for(scope: Option<&String>) -> Result<MemoryTier, String> {
    match scope.map(String::as_str) {
        None | Some("user") => Ok(MemoryTier::Global),
        Some("project") => Ok(MemoryTier::Project),
        Some(other) => Err(format!("scope must be user or project, not {other}")),
    }
}

fn memory_path(manager: &MemoryManager, tier: &MemoryTier) -> Option<std::path::PathBuf> {
    manager
        .list()
        .into_iter()
        .find(|(listed, _, _)| listed == tier)
        .map(|(_, path, _)| path)
}

async fn confirmed(
    title: String,
    detail: String,
    path: std::path::PathBuf,
    require_confirmation: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> bool {
    if !require_confirmation {
        return true;
    }
    let request = ApprovalRequest::new(
        ApprovalRequestKind::FileEdit { path },
        title.clone(),
        vec![detail],
    );
    if let Some(decision) = request_approval(approval_callback, request).await {
        return approval_allows(decision);
    }
    crate::interactive::can_prompt()
        && dialoguer::Confirm::new()
            .with_prompt(title)
            .default(false)
            .interact()
            .unwrap_or(false)
}

pub(super) async fn execute_memory(
    args: &HashMap<String, String>,
    require_confirmation: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> Result<ToolResult> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let manager = MemoryManager::new(&cwd);
    let content = args
        .get("content")
        .map(|content| content.trim())
        .filter(|content| !content.is_empty());
    let tier = match tier_for(args.get("scope")) {
        Ok(tier) => tier,
        Err(reason) => return Ok(result(false, reason)),
    };

    match args.get("action").map(String::as_str) {
        Some("recall") => {
            let prompt = manager.get_context_prompt();
            Ok(result(
                true,
                if prompt.is_empty() {
                    "Nothing is remembered yet.".to_string()
                } else {
                    prompt
                },
            ))
        }
        Some("remember") => {
            let Some(content) = content else {
                return Ok(result(false, "remember needs content"));
            };
            if content.chars().count() > MAX_MEMORY_CHARS {
                return Ok(result(
                    false,
                    format!("Keep a memory under {MAX_MEMORY_CHARS} characters."),
                ));
            }
            let Some(path) = memory_path(&manager, &tier) else {
                return Ok(result(false, "No memory file for that scope here."));
            };
            if !confirmed(
                format!("Remember this in {tier} memory?"),
                content.to_string(),
                path,
                require_confirmation,
                approval_callback,
            )
            .await
            {
                return Ok(result(
                    false,
                    "The user did not approve saving that memory.",
                ));
            }
            match manager.save(&tier, &format!("- {content}")) {
                Ok(path) => Ok(result(true, format!("Remembered in {}.", path.display()))),
                Err(reason) => Ok(result(false, reason)),
            }
        }
        Some("forget") => {
            let Some(content) = content else {
                return Ok(result(false, "forget needs the remembered text"));
            };
            let Some(path) = memory_path(&manager, &tier).filter(|path| path.is_file()) else {
                return Ok(result(false, "Nothing is remembered in that scope."));
            };
            let existing = std::fs::read_to_string(&path)?;
            let matches = |line: &str| {
                let line = line.trim();
                line == content || line.strip_prefix("- ").map(str::trim) == Some(content)
            };
            let removed = existing.lines().filter(|line| matches(line)).count();
            if removed == 0 {
                return Ok(result(
                    false,
                    format!(
                        "No remembered line in {} matches that text.",
                        path.display()
                    ),
                ));
            }
            if !confirmed(
                format!("Forget this from {tier} memory?"),
                content.to_string(),
                path.clone(),
                require_confirmation,
                approval_callback,
            )
            .await
            {
                return Ok(result(
                    false,
                    "The user did not approve removing that memory.",
                ));
            }
            let kept: Vec<&str> = existing.lines().filter(|line| !matches(line)).collect();
            std::fs::write(&path, format!("{}\n", kept.join("\n")))?;
            Ok(result(
                true,
                format!("Forgot {removed} line(s) in {}.", path.display()),
            ))
        }
        _ => Ok(result(false, "action must be remember, recall or forget")),
    }
}
