use std::collections::HashMap;

use anyhow::Result;
use dialoguer::Confirm;

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

    // C3 execution-policy gate: every command the string would run, including the
    // ones after `&&`, `;`, `|` or inside `$(...)`, is evaluated before anything
    // executes. A `Forbidden` decision is a hard block that no confirmation can
    // override. Confirmation is only waived when EVERY segment matched an explicit
    // allow rule.
    {
        use crate::features::exec::exec_policy::{evaluate_command, load_policy};
        use agiworkforce_execpolicy::Decision;
        let evaluation = evaluate_command(&load_policy()?, command);
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
            Decision::Prompt if evaluation.matched_rule => require_confirmation = true,
            Decision::Allow if evaluation.every_segment_matched_rule => {
                require_confirmation = false
            }
            Decision::Prompt | Decision::Allow => {}
        }
    }

    if require_confirmation {
        let safety = classify_command(command);
        if !matches!(safety, CommandSafety::Safe) {
            let perms = crate::permissions::PermissionStore::load().unwrap_or_default();

            match perms.check_command(command) {
                Some(true) => {
                    // Previously allowed, skip prompt
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
                                    crate::features::exec::exec_policy::persist_allow_command(
                                        command,
                                    )
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
                                    ts::muted(describe_command(command))
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

    let result: std::io::Result<std::process::Output> = if crate::sandbox::sandbox_disabled() {
        let mut command_process = tokio::process::Command::new("sh");
        command_process.arg("-c").arg(command);
        crate::process_tree::output(command_process, None, Some(COMMAND_TIMEOUT)).await
    } else {
        let network =
            sandbox_network_policy(command, require_confirmation, approval_callback).await;
        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let cmd = command.to_string();
        let sandbox_result = async move {
            let mgr = crate::sandbox::SandboxManager::for_command_execution(cwd.clone(), network)
                .map_err(|e| std::io::Error::other(e.to_string()))?;
            crate::sandbox::execute_sandboxed_with_timeout(
                &mgr,
                &cmd,
                Some(&cwd),
                Some(COMMAND_TIMEOUT),
            )
            .await
            .map_err(|error| {
                let kind = error
                    .downcast_ref::<std::io::Error>()
                    .map(std::io::Error::kind)
                    .unwrap_or(std::io::ErrorKind::Other);
                std::io::Error::new(kind, error.to_string())
            })
        }
        .await;
        if let Err(ref e) = sandbox_result {
            let msg = e.to_string();
            if e.kind() != std::io::ErrorKind::TimedOut
                && (msg.contains("sandbox") || msg.contains("bwrap") || msg.contains("Seatbelt"))
            {
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
        Ok(output) => {
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
        Err(e) if e.kind() != std::io::ErrorKind::TimedOut => Ok(ToolResult {
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

fn command_requests_network(command: &str) -> bool {
    crate::safety::split_segments(command)
        .iter()
        .any(|segment| {
            let mut words = segment.split_whitespace();
            let program = crate::safety::approval::strip_path(words.next().unwrap_or(""));
            let mut action = "";
            while let Some(word) = words.next() {
                if matches!(word, "-c" | "-C") {
                    words.next();
                } else if !word.starts_with('-') {
                    action = word;
                    break;
                }
            }
            match program {
                "curl" | "wget" => true,
                "git" => matches!(action, "clone" | "fetch" | "pull" | "push" | "ls-remote"),
                "npm" | "pnpm" | "yarn" | "bun" => {
                    matches!(
                        action,
                        "install" | "i" | "add" | "ci" | "update" | "upgrade"
                    )
                }
                "pip" | "pip3" => matches!(action, "install" | "download"),
                "cargo" => matches!(action, "fetch" | "install" | "update" | "add" | "search"),
                "go" => matches!(action, "get" | "install"),
                _ => false,
            }
        })
}

async fn sandbox_network_policy(
    command: &str,
    require_confirmation: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> crate::sandbox::NetworkPolicy {
    if !require_confirmation || !command_requests_network(command) {
        return crate::sandbox::NetworkPolicy::Deny;
    }
    let summary = "This command needs the network, which the sandbox blocks.";
    let request = ApprovalRequest::new(
        ApprovalRequestKind::Network {
            tool_name: "run_command".to_string(),
            destination: "the network".to_string(),
        },
        summary,
        vec![describe_command(command)],
    );
    let allowed = match request_approval(approval_callback, request).await {
        Some(decision) => approval_allows(decision),
        None => Confirm::new()
            .with_prompt(format!("{summary} Allow network access for it?"))
            .default(false)
            .interact()
            .unwrap_or(false),
    };
    if allowed {
        crate::sandbox::NetworkPolicy::Allow
    } else {
        crate::sandbox::NetworkPolicy::Deny
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn network_needing_commands_are_recognised_through_chains() {
        for command in [
            "git clone https://example.invalid/repo.git",
            "cd app && pnpm install",
            "curl -s https://example.invalid",
            "/usr/bin/git -c x=y fetch origin",
            "pip3 install requests",
        ] {
            assert!(command_requests_network(command), "{command}");
        }
        for command in [
            "git status",
            "cargo test",
            "ls -la",
            "npm test",
            "echo curl",
        ] {
            assert!(!command_requests_network(command), "{command}");
        }
    }

    #[tokio::test]
    async fn a_network_command_asks_for_network_and_keeps_it_denied_unless_approved() {
        let seen: Arc<Mutex<Vec<ApprovalRequestKind>>> = Arc::new(Mutex::new(Vec::new()));
        let recorder = Arc::clone(&seen);
        let callback: ApprovalCallback = Arc::new(move |request| {
            let recorder = Arc::clone(&recorder);
            Box::pin(async move {
                recorder.lock().expect("seen lock").push(request.kind);
                ApprovalDecision::Deny
            })
        });

        let denied = sandbox_network_policy("git pull", true, Some(&callback)).await;
        assert_eq!(denied, crate::sandbox::NetworkPolicy::Deny);
        assert_eq!(
            *seen.lock().expect("seen lock"),
            vec![ApprovalRequestKind::Network {
                tool_name: "run_command".to_string(),
                destination: "the network".to_string(),
            }]
        );

        let allow: ApprovalCallback = Arc::new(|_| Box::pin(async { ApprovalDecision::AllowOnce }));
        assert_eq!(
            sandbox_network_policy("git pull", true, Some(&allow)).await,
            crate::sandbox::NetworkPolicy::Allow
        );
        assert_eq!(
            sandbox_network_policy("git status", true, Some(&allow)).await,
            crate::sandbox::NetworkPolicy::Deny
        );
        assert_eq!(
            sandbox_network_policy("git pull", false, Some(&allow)).await,
            crate::sandbox::NetworkPolicy::Deny
        );
    }

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
