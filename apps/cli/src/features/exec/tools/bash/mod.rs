use std::collections::HashMap;

use anyhow::Result;
use colored::Colorize;
use dialoguer::Confirm;
use tokio::process::Command;

use crate::safety::{classify_command, CommandSafety};
use crate::terminal_style as ts;
use crate::tui::approval_broker::{ApprovalDecision, ApprovalRequest, ApprovalRequestKind};

use super::common::{
    describe_command, print_tool_status, truncate_output_with_save, COMMAND_TIMEOUT,
};
use super::{approval_allows, request_approval, ApprovalCallback, ToolResult};

pub(super) async fn execute_run_command(
    args: &HashMap<String, String>,
    mut require_confirmation: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> Result<ToolResult> {
    let command = match args.get("command") {
        Some(c) => c,
        None => {
            return Ok(ToolResult {
                tool_name: "run_command".to_string(),
                success: false,
                output: "Missing required argument: command".to_string(),
            });
        }
    };

    print_tool_status("run_command", &format!("Bash({})", command));

    // C3 execution-policy gate: evaluate every command against the policy BEFORE
    // running it. A `Forbidden` decision is a hard block that no confirmation can
    // override — this is the agent-loop's last line of defense against
    // catastrophic, irrecoverable commands. `Allow`/`Prompt` fall through to the
    // existing confirmation flow below.
    {
        use crate::features::exec::exec_policy::{evaluate_policy, load_policy};
        use agiworkforce_execpolicy::Decision;
        let evaluation = evaluate_policy(&load_policy()?, command);
        match evaluation.decision {
            Decision::Forbidden => {
                return Ok(ToolResult {
                    tool_name: "run_command".to_string(),
                    success: false,
                    output: format!(
                        "Command '{}' is blocked by the execution policy (forbidden) and was not run.",
                        command
                    ),
                });
            }
            Decision::Prompt if evaluation.is_match() => require_confirmation = true,
            Decision::Allow if evaluation.is_match() => require_confirmation = false,
            Decision::Prompt | Decision::Allow => {}
        }
    }

    if require_confirmation {
        let safety = classify_command(command);
        if !matches!(safety, CommandSafety::Safe) {
            let perms = crate::permissions::PermissionStore::load().unwrap_or_default();

            match perms.check_command(command) {
                Some(true) => {
                    // Previously allowed — skip prompt
                }
                Some(false) => {
                    return Ok(ToolResult {
                        tool_name: "run_command".to_string(),
                        success: false,
                        output: format!(
                            "Command '{}' is denied by saved permissions. Use /permissions reset to clear.",
                            command
                        ),
                    });
                }
                None => {
                    let (prompt_msg, default) = match safety {
                        CommandSafety::Dangerous => {
                            ("This command could be destructive. Allow it?", false)
                        }
                        _ => ("Allow this command?", true),
                    };

                    if let Some(decision) = request_approval(
                        approval_callback,
                        ApprovalRequest::new(
                            ApprovalRequestKind::Exec {
                                command: command.to_string(),
                            },
                            prompt_msg,
                            vec![describe_command(command)],
                        ),
                    )
                    .await
                    {
                        if !approval_allows(decision) {
                            return Ok(ToolResult {
                                tool_name: "run_command".to_string(),
                                success: false,
                                output: "User denied command execution".to_string(),
                            });
                        }

                        let mut perms =
                            crate::permissions::PermissionStore::load().unwrap_or_default();
                        match decision {
                            ApprovalDecision::AllowSession => {
                                perms.allow_session_for_process(command);
                            }
                            ApprovalDecision::AlwaysAllow => {
                                if let Err(error) =
                                    crate::features::exec::exec_policy::persist_allow_command(command)
                                        .await
                                {
                                    return Ok(ToolResult {
                                        tool_name: "run_command".to_string(),
                                        success: false,
                                        output: format!(
                                            "Command was approved but its Always Allow rule could not be saved ({error}); the command was not run. Choose Allow Once to proceed without persistence."
                                        ),
                                    });
                                }
                            }
                            _ => {}
                        }
                    } else {
                        match safety {
                            CommandSafety::Dangerous => {
                                eprintln!(
                                    "  {} {}",
                                    ts::danger_header("DANGEROUS:"),
                                    ts::danger(describe_command(command))
                                );
                            }
                            _ => {
                                eprintln!(
                                    "  {} {}",
                                    ts::warning("Command:"),
                                    describe_command(command).dimmed()
                                );
                            }
                        }

                        let confirmed = Confirm::new()
                            .with_prompt(prompt_msg)
                            .default(default)
                            .interact()
                            .unwrap_or(false);

                        if !confirmed {
                            return Ok(ToolResult {
                                tool_name: "run_command".to_string(),
                                success: false,
                                output: "User denied command execution".to_string(),
                            });
                        }

                        let mut perms =
                            crate::permissions::PermissionStore::load().unwrap_or_default();
                        perms.allow_session_for_process(command);
                    }
                }
            }
        }
    }

    let result: std::result::Result<
        std::result::Result<std::process::Output, std::io::Error>,
        tokio::time::error::Elapsed,
    > = if crate::sandbox::sandbox_disabled() {
        tokio::time::timeout(
            COMMAND_TIMEOUT,
            Command::new("sh").arg("-c").arg(command).output(),
        )
        .await
    } else {
        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let cmd = command.to_string();
        let sandbox_result = tokio::time::timeout(COMMAND_TIMEOUT, async move {
            let mgr = crate::sandbox::SandboxManager::for_command_execution(
                cwd.clone(),
                crate::sandbox::NetworkPolicy::Deny,
            )
            .map_err(|e| std::io::Error::other(e.to_string()))?;
            crate::sandbox::execute_sandboxed(&mgr, &cmd, Some(&cwd))
                .await
                .map_err(|e| std::io::Error::other(e.to_string()))
        })
        .await;
        if let Ok(Err(ref e)) = sandbox_result {
            let msg = e.to_string();
            if msg.contains("sandbox") || msg.contains("bwrap") || msg.contains("Seatbelt") {
                return Ok(ToolResult {
                    tool_name: "run_command".to_string(),
                    success: false,
                    output: format!(
                        "Sandbox unavailable ({}). Re-run with --no-sandbox only if you accept unrestricted command execution.",
                        msg,
                    ),
                });
            }
        }
        sandbox_result
    };

    match result {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();

            let mut combined = String::new();
            if !stdout.is_empty() {
                combined.push_str(&stdout);
            }
            if !stderr.is_empty() {
                if !combined.is_empty() {
                    combined.push('\n');
                }
                combined.push_str("[stderr]\n");
                combined.push_str(&stderr);
            }

            if combined.is_empty() {
                combined = "(no output)".to_string();
            }

            let combined = truncate_output_with_save("run_command", combined);

            Ok(ToolResult {
                tool_name: "run_command".to_string(),
                success: output.status.success(),
                output: format!(
                    "Exit code: {}\n{}",
                    output.status.code().unwrap_or(-1),
                    combined
                ),
            })
        }
        Ok(Err(e)) => Ok(ToolResult {
            tool_name: "run_command".to_string(),
            success: false,
            output: format!("Failed to execute command: {}", e),
        }),
        Err(_) => Ok(ToolResult {
            tool_name: "run_command".to_string(),
            success: false,
            output: format!(
                "Command timed out after {} seconds",
                COMMAND_TIMEOUT.as_secs()
            ),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[tokio::test]
    async fn unsafe_command_uses_approval_callback() {
        let seen_kind: Arc<Mutex<Option<ApprovalRequestKind>>> = Arc::new(Mutex::new(None));
        let seen_for_callback = Arc::clone(&seen_kind);
        let callback: ApprovalCallback = Arc::new(move |request| {
            let seen_for_callback = Arc::clone(&seen_for_callback);
            Box::pin(async move {
                *seen_for_callback.lock().expect("seen lock") = Some(request.kind);
                ApprovalDecision::Deny
            })
        });

        let mut args = HashMap::new();
        args.insert(
            "command".to_string(),
            "rm -rf /tmp/agiworkforce-callback-test".to_string(),
        );

        let result = execute_run_command(&args, true, Some(&callback))
            .await
            .expect("tool result");

        assert!(!result.success);
        assert_eq!(result.output, "User denied command execution");
        assert_eq!(
            *seen_kind.lock().expect("seen lock"),
            Some(ApprovalRequestKind::Exec {
                command: "rm -rf /tmp/agiworkforce-callback-test".to_string()
            })
        );
    }
}
