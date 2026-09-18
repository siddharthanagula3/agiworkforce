use std::collections::HashMap;

use anyhow::Result;
use dialoguer::Confirm;

use crate::safety::argv::parse_simple_command;
use crate::safety::network_target::internal_destination;
use crate::safety::{
    bypasses_git_hooks, classify_command, classify_filesystem_effect, git_hook_bypass_reason,
    CommandSafety,
};
use crate::secret_redaction::redact_tool_output;
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
                        redact_tool_output(command)
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
        let hook_bypass = bypasses_git_hooks(command);
        if !matches!(safety, CommandSafety::Safe) {
            let perms = crate::permissions::PermissionStore::load().unwrap_or_default();

            match perms.check_command_allowing_hook_bypass(command) {
                Some(true) => {
                    // Previously allowed, skip prompt
                }
                Some(false) => {
                    return Ok(ToolResult {
                        tool_name: "run_command".to_string(),
                        success: false,
                        output: format!(
                            "Command '{}' is denied by saved permissions. Use /permissions reset to clear.",
                            redact_tool_output(command)
                        ),
                    });
                }
                None => {
                    let (prompt_msg, default) = if hook_bypass {
                        (
                            "This command turns the repository's git hooks off. Allow it?",
                            false,
                        )
                    } else {
                        match safety {
                            CommandSafety::Dangerous => {
                                ("This command could be destructive. Allow it?", false)
                            }
                            _ => ("Allow this command?", true),
                        }
                    };
                    let mut details = vec![
                        describe_command(command),
                        classify_filesystem_effect(command).describe().to_string(),
                    ];
                    if hook_bypass {
                        details.push(git_hook_bypass_reason().to_string());
                    }

                    if let Some(decision) = request_approval(
                        approval_callback,
                        ApprovalRequest::new(
                            ApprovalRequestKind::Exec {
                                command: command.to_string(),
                            },
                            prompt_msg,
                            details,
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

                        eprintln!(
                            "  {} {}",
                            ts::warning("Effect:"),
                            ts::muted(classify_filesystem_effect(command).describe())
                        );

                        if hook_bypass {
                            eprintln!(
                                "  {} {}",
                                ts::danger_header("HOOKS OFF:"),
                                ts::danger(git_hook_bypass_reason())
                            );
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

    // Most command strings are a program and its operands, and handing those to
    // `sh -c` is the only reason an operand can be read as syntax. When the
    // string needs no shell, it is exec'd as argv instead.
    let structured = parse_simple_command(command);

    let result: std::io::Result<std::process::Output> = if crate::sandbox::sandbox_disabled() {
        let command_process = match &structured {
            Some((program, args)) => {
                let mut process = tokio::process::Command::new(program);
                process.args(args);
                process
            }
            None => {
                let mut process = tokio::process::Command::new("sh");
                process.arg("-c").arg(command);
                process
            }
        };
        crate::process_tree::output(command_process, None, Some(COMMAND_TIMEOUT)).await
    } else {
        if let Some(host) = command_requests_network(command)
            .then(|| internal_destination(command))
            .flatten()
        {
            return Ok(ToolResult {
                tool_name: "run_command".to_string(),
                success: false,
                output: format!(
                    "Command '{}' targets {}, which the sandbox blocks: a request the model composes must not reach a service on this machine or a cloud instance-metadata endpoint. Re-run with --no-sandbox only if you accept unrestricted command execution.",
                    redact_tool_output(command),
                    host,
                ),
            });
        }
        let network =
            sandbox_network_policy(command, require_confirmation, approval_callback).await;
        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let cmd = command.to_string();
        let structured = structured.clone();
        let sandbox_result = async move {
            let mgr = crate::sandbox::SandboxManager::for_command_execution(cwd.clone(), network)
                .map_err(|e| std::io::Error::other(e.to_string()))?;
            let executed = match &structured {
                Some((program, args)) => {
                    crate::sandbox::execute_sandboxed_program_with_timeout(
                        &mgr,
                        program,
                        args,
                        Some(&cwd),
                        Some(COMMAND_TIMEOUT),
                    )
                    .await
                }
                None => {
                    crate::sandbox::execute_sandboxed_with_timeout(
                        &mgr,
                        &cmd,
                        Some(&cwd),
                        Some(COMMAND_TIMEOUT),
                    )
                    .await
                }
            };
            executed.map_err(|error| {
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
            destination: "external hosts (this machine stays unreachable)".to_string(),
        },
        summary,
        vec![describe_command(command)],
    );
    let allowed = match request_approval(approval_callback, request).await {
        Some(decision) => approval_allows(decision),
        None => Confirm::new()
            .with_prompt(format!("{summary} Allow external network access for it?"))
            .default(false)
            .interact()
            .unwrap_or(false),
    };
    if allowed {
        crate::sandbox::NetworkPolicy::AllowExternal
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
                destination: "external hosts (this machine stays unreachable)".to_string(),
            }]
        );

        let allow: ApprovalCallback = Arc::new(|_| Box::pin(async { ApprovalDecision::AllowOnce }));
        assert_eq!(
            sandbox_network_policy("git pull", true, Some(&allow)).await,
            crate::sandbox::NetworkPolicy::AllowExternal
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

    #[test]
    fn the_run_command_tool_reads_internal_destinations_from_the_shared_owner() {
        for command in [
            "curl http://localhost:3000/admin",
            "curl -s http://127.0.0.1:8080/",
            "curl http://169.254.169.254/latest/meta-data/iam/security-credentials/",
            "curl http://metadata.google.internal/computeMetadata/v1/",
            "curl http://2130706433/",
            "git clone http://localhost:7000/repo.git",
        ] {
            assert!(
                internal_destination(command).is_some(),
                "should be refused: {command}"
            );
        }
        for command in [
            "curl https://api.example.com/v1/models",
            "git clone https://github.com/acme/app.git",
        ] {
            assert_eq!(
                internal_destination(command),
                None,
                "should not be refused: {command}"
            );
        }
        // The refusal is gated on the command actually reaching the network, so
        // a string that merely mentions a loopback URL is not refused.
        assert!(internal_destination("echo http://localhost:3000").is_some());
        assert!(!command_requests_network("echo http://localhost:3000"));
    }

    /// The sandboxed execution paths are only meaningful where a backend is
    /// present and enabled; a host without one is a different code path.
    fn sandbox_available() -> bool {
        !crate::sandbox::sandbox_disabled()
            && crate::sandbox::SandboxType::detect() != crate::sandbox::SandboxType::None
    }

    #[tokio::test]
    async fn a_command_reaching_the_instance_metadata_endpoint_is_refused_before_approval() {
        if !sandbox_available() {
            return;
        }
        let callback: ApprovalCallback =
            Arc::new(|_| Box::pin(async { ApprovalDecision::AllowOnce }));
        let mut args = HashMap::new();
        args.insert(
            "command".to_string(),
            "curl -s http://169.254.169.254/latest/meta-data/".to_string(),
        );

        let result = execute_run_command(&args, false, Some(&callback))
            .await
            .expect("tool result");

        assert!(!result.success);
        assert!(
            result.output.contains("169.254.169.254"),
            "refusal must name the destination: {}",
            result.output
        );
    }

    #[test]
    fn a_plain_command_runs_as_argv_and_a_shell_one_does_not() {
        assert_eq!(
            parse_simple_command("git status --porcelain"),
            Some((
                "git".to_string(),
                vec!["status".to_string(), "--porcelain".to_string()]
            ))
        );
        assert_eq!(parse_simple_command("ls | wc -l"), None);
        // A shell builtin has no binary of the same behaviour to exec.
        assert_eq!(parse_simple_command("cd src"), None);
    }

    #[tokio::test]
    async fn an_argv_execution_treats_a_separator_in_an_operand_as_data() {
        if !sandbox_available() {
            return;
        }
        // Through `sh -c` the quoted `;` would still be quoted, but the operand
        // only survives as one word because nothing re-parses it.
        let mut args = HashMap::new();
        args.insert("command".to_string(), "basename 'one; two'".to_string());

        let result = execute_run_command(&args, false, None)
            .await
            .expect("tool result");

        assert!(result.success, "{}", result.output);
        assert!(
            result.output.contains("one; two"),
            "operand must reach the program intact: {}",
            result.output
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
