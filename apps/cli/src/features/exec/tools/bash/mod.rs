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
    require_confirmation: bool,
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

    let working_dir = match command_working_dir(args) {
        Ok(dir) => dir,
        Err(reason) => {
            return Ok(ToolResult {
                tool_name: "run_command".to_string(),
                success: false,
                output: format!("The command was not run: {reason}"),
            });
        }
    };

    print_tool_status("run_command", &format!("Bash({})", command));

    let mut details = Vec::new();
    if let Some(dir) = &working_dir {
        details.push(format!("in {}", dir.display()));
    }
    let require_confirmation = match approve_command(
        "run_command",
        command,
        details,
        require_confirmation,
        approval_callback,
    )
    .await?
    {
        Ok(require_confirmation) => require_confirmation,
        Err(refusal) => return Ok(refusal),
    };

    // Most command strings are a program and its operands, and handing those to
    // `sh -c` is the only reason an operand can be read as syntax. When the
    // string needs no shell, it is exec'd as argv instead.
    let structured = parse_simple_command(command)
        .filter(|(program, _)| !crate::shell_snapshot::defines(program))
        .map(|(program, args)| crate::shell_snapshot::program_invocation(program, args))
        .or_else(|| crate::shell_snapshot::shell_invocation(command));

    if args
        .get("run_in_background")
        .is_some_and(|value| matches!(value.trim(), "true" | "1" | "yes"))
    {
        return start_in_background(
            command,
            structured,
            working_dir,
            require_confirmation,
            approval_callback,
        )
        .await;
    }

    let cwd = crate::path_security::validation_workspace();
    let unrestricted = crate::sandbox::sandbox_disabled_for_workspace(&cwd);
    let result: std::io::Result<std::process::Output> = {
        if !unrestricted {
            if let Some(refusal) = internal_destination_refusal(command) {
                return Ok(refusal);
            }
        }
        let network = if unrestricted {
            crate::sandbox::NetworkPolicy::Allow
        } else {
            sandbox_network_policy(command, require_confirmation, approval_callback).await
        };
        let run_in = working_dir.clone().unwrap_or_else(|| cwd.clone());
        let cmd = command.to_string();
        let structured = structured.clone();
        let sandbox_result = async move {
            let mgr = if unrestricted {
                crate::sandbox::SandboxManager::new(
                    crate::sandbox::SandboxPolicy::DangerFullAccess,
                    cwd.clone(),
                )
                .with_network(network)
            } else {
                crate::sandbox::SandboxManager::for_agent_command(cwd.clone(), network)
                    .map_err(|e| std::io::Error::other(e.to_string()))?
            };
            let executed = match &structured {
                Some((program, args)) => {
                    crate::sandbox::execute_sandboxed_program_with_timeout(
                        &mgr,
                        program,
                        args,
                        Some(&run_in),
                        Some(COMMAND_TIMEOUT),
                    )
                    .await
                }
                None => {
                    crate::sandbox::execute_sandboxed_with_timeout(
                        &mgr,
                        &cmd,
                        Some(&run_in),
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

fn internal_destination_refusal(command: &str) -> Option<ToolResult> {
    let host = command_requests_network(command)
        .then(|| internal_destination(command))
        .flatten()?;
    Some(ToolResult {
        tool_name: "run_command".to_string(),
        success: false,
        output: format!(
            "Command '{}' targets {}, which the sandbox blocks: a request the model composes must not reach a service on this machine or a cloud instance-metadata endpoint. Re-run with --no-sandbox only if you accept unrestricted command execution.",
            redact_tool_output(command),
            host,
        ),
    })
}

async fn start_in_background(
    command: &str,
    structured: Option<(String, Vec<String>)>,
    working_dir: Option<std::path::PathBuf>,
    require_confirmation: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> Result<ToolResult> {
    let refuse = |output: String| ToolResult {
        tool_name: "run_command".to_string(),
        success: false,
        output,
    };
    let cwd = crate::path_security::validation_workspace();
    let run_in = working_dir.unwrap_or_else(|| cwd.clone());
    let manager = if crate::sandbox::sandbox_disabled_for_workspace(&cwd) {
        Some(
            crate::sandbox::SandboxManager::new(
                crate::sandbox::SandboxPolicy::DangerFullAccess,
                cwd.clone(),
            )
            .with_network(crate::sandbox::NetworkPolicy::Allow),
        )
    } else {
        if let Some(refusal) = internal_destination_refusal(command) {
            return Ok(refusal);
        }
        let network =
            sandbox_network_policy(command, require_confirmation, approval_callback).await;
        match crate::sandbox::SandboxManager::for_agent_command(cwd, network) {
            Ok(manager) => Some(manager),
            Err(error) => {
                return Ok(refuse(format!(
                    "Sandbox unavailable ({error}). Re-run with --no-sandbox only if you accept unrestricted command execution."
                )))
            }
        }
    };
    let invocation = match &structured {
        Some((program, args)) => crate::sandbox::Invocation::Program { program, args },
        None => crate::sandbox::Invocation::Shell(command),
    };
    let background = match crate::terminals::start(command, |terminal| {
        crate::sandbox::background_command(manager.as_ref(), invocation, &run_in, terminal)
    }) {
        Ok(background) => background,
        Err(error) => return Ok(refuse(format!("The command did not start: {error:#}"))),
    };
    let output = crate::terminals::read_new(&background, crate::terminals::FIRST_OUTPUT_WAIT).await;
    let how = if background.terminal {
        "in a pseudo-terminal"
    } else {
        "with piped input and output, because this system has no pseudo-terminal"
    };
    Ok(ToolResult {
        tool_name: "run_command".to_string(),
        success: !matches!(output.state, crate::terminals::CommandState::Exited(code) if code != Some(0)),
        output: truncate_output_with_save(
            "run_command",
            format!(
                "Started {} in the background {how}. Read what it prints or type into it with command_output, and end it with command_stop.\n{}",
                background.id,
                crate::terminals::report(&background, &output)
            ),
        ),
    })
}

pub(super) async fn execute_command_output(
    args: &HashMap<String, String>,
    pending_input: Option<crate::terminals::InputTransaction>,
    require_confirmation: bool,
    approved_this_call: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> Result<ToolResult> {
    let result = |success: bool, output: String| ToolResult {
        tool_name: "command_output".to_string(),
        success,
        output,
    };
    let Some(id) = args
        .get("id")
        .map(|id| id.trim())
        .filter(|id| !id.is_empty())
    else {
        return Ok(result(
            true,
            crate::terminals::summary(&crate::terminals::list()),
        ));
    };
    let Some(background) = crate::terminals::find(id) else {
        return Ok(result(
            false,
            format!("There is no background command {id}. Call command_output without an id to list them."),
        ));
    };
    print_tool_status("command_output", &background.id);
    if args.get("input").is_some_and(|input| !input.is_empty()) {
        if background.state() != crate::terminals::CommandState::Running {
            let output = crate::terminals::read_new(&background, std::time::Duration::ZERO).await;
            return Ok(result(
                false,
                format!(
                    "The input was not sent because the command is no longer running.\n{}",
                    crate::terminals::report(&background, &output)
                ),
            ));
        }
        let Some(input) = pending_input else {
            return Ok(result(
                false,
                "Input could not be validated for this running command".into(),
            ));
        };
        let evaluation = crate::features::exec::exec_policy::evaluate_command(
            &crate::features::exec::exec_policy::load_policy()?,
            input.cumulative_input(),
        );
        if evaluation.decision == agiworkforce_execpolicy::Decision::Forbidden {
            return Ok(result(
                false,
                "Input was blocked by the execution policy and was not sent".into(),
            ));
        }
        if !approved_this_call
            && (require_confirmation
                || (evaluation.decision == agiworkforce_execpolicy::Decision::Prompt
                    && evaluation.matched_rule))
        {
            let request = ApprovalRequest::new(
                ApprovalRequestKind::Exec {
                    command: format!("Input to {}", background.id),
                },
                "Allow sending input to this running command?",
                vec![background.id.clone()],
            )
            .with_tool_subject("command_output", serde_json::json!({"id": background.id}))
            .requiring_explicit_decision();
            let allowed = match request_approval(approval_callback, request).await {
                Some(decision) => approval_allows(decision),
                None if !std::io::IsTerminal::is_terminal(&std::io::stdin()) => false,
                None => Confirm::new()
                    .with_prompt("Allow sending input to this running command?")
                    .default(false)
                    .interact()
                    .unwrap_or(false),
            };
            if !allowed {
                return Ok(result(
                    false,
                    "Input was not approved and was not sent".into(),
                ));
            }
        }
        if let Err(error) = input.send().await {
            return Ok(result(false, format!("{error:#}")));
        }
    }
    let wait = args
        .get("wait_seconds")
        .and_then(|value| value.trim().parse::<f64>().ok())
        .filter(|seconds| seconds.is_finite() && *seconds >= 0.0)
        .map(|seconds| std::time::Duration::from_secs_f64(seconds).min(crate::terminals::MAX_WAIT))
        .unwrap_or(crate::terminals::DEFAULT_WAIT);
    let output = crate::terminals::read_new(&background, wait).await;
    Ok(result(
        true,
        truncate_output_with_save(
            "command_output",
            crate::terminals::report(&background, &output),
        ),
    ))
}

pub(super) async fn execute_command_stop(args: &HashMap<String, String>) -> Result<ToolResult> {
    let result = |success: bool, output: String| ToolResult {
        tool_name: "command_stop".to_string(),
        success,
        output,
    };
    let Some(background) = args.get("id").and_then(|id| crate::terminals::find(id)) else {
        return Ok(result(
            false,
            "There is no background command with that id. Call command_output without an id to list them.".to_string(),
        ));
    };
    print_tool_status("command_stop", &background.id);
    let already_ended = background.state() != crate::terminals::CommandState::Running;
    let state = crate::terminals::stop(&background).await;
    let output = crate::terminals::read_new(&background, std::time::Duration::ZERO).await;
    let note = if already_ended {
        "It had already ended."
    } else if state == crate::terminals::CommandState::Running {
        "It was killed and is still shutting down."
    } else {
        "Stopped it and everything it started."
    };
    Ok(result(
        state != crate::terminals::CommandState::Running,
        truncate_output_with_save(
            "command_stop",
            format!("{note}\n{}", crate::terminals::report(&background, &output)),
        ),
    ))
}

pub(super) async fn approve_command(
    tool_name: &str,
    command: &str,
    extra_details: Vec<String>,
    mut require_confirmation: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> Result<std::result::Result<bool, ToolResult>> {
    // C3 execution-policy gate: every command the string would run, including the
    // ones after `&&`, `;`, `|` or inside `$(...)`, is evaluated before anything
    // executes. A `Forbidden` decision is a hard block that no confirmation can
    // override. Confirmation is only waived when EVERY segment matched an explicit
    // allow rule.
    let asks = require_confirmation
        && crate::permissions::PermissionStore::load()
            .unwrap_or_default()
            .asks_before(command);
    {
        use crate::features::exec::exec_policy::{evaluate_command, load_policy};
        use agiworkforce_execpolicy::Decision;
        let evaluation = evaluate_command(&load_policy()?, command);
        match evaluation.decision {
            Decision::Forbidden => {
                return Ok(Err(ToolResult {
                    tool_name: tool_name.to_string(),
                    success: false,
                    output: format!(
                        "Command '{}' is blocked by the execution policy (forbidden) and was not run.",
                        redact_tool_output(command)
                    ),
                }));
            }
            Decision::Prompt if evaluation.matched_rule => require_confirmation = true,
            Decision::Allow if !asks && policy_waives_confirmation(&evaluation, command) => {
                require_confirmation = false
            }
            Decision::Prompt | Decision::Allow => {}
        }
    }

    if require_confirmation {
        let safety = classify_command(command);
        let hook_bypass = bypasses_git_hooks(command);
        if asks || !matches!(safety, CommandSafety::Safe) {
            let perms = crate::permissions::PermissionStore::load().unwrap_or_default();

            match saved_command_decision(&perms, command, safety) {
                Some(true) => {
                    // Previously allowed, skip prompt
                }
                Some(false) => {
                    return Ok(Err(ToolResult {
                        tool_name: tool_name.to_string(),
                        success: false,
                        output: format!(
                            "Command '{}' is denied by saved permissions. Use /permissions reset to clear.",
                            redact_tool_output(command)
                        ),
                    }));
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
                    details.extend(extra_details);
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
                        )
                        .saving_always_allow(
                            crate::features::exec::exec_policy::can_persist_allow_command(command),
                        ),
                    )
                    .await
                    {
                        if !approval_allows(decision) {
                            return Ok(Err(ToolResult {
                                tool_name: tool_name.to_string(),
                                success: false,
                                output: "User denied command execution".to_string(),
                            }));
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
                                    return Ok(Err(ToolResult {
                                        tool_name: tool_name.to_string(),
                                        success: false,
                                        output: format!(
                                            "Command was approved but its Always Allow rule could not be saved ({error}); the command was not run. Choose Allow Once to proceed without persistence."
                                        ),
                                    }));
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
                            return Ok(Err(ToolResult {
                                tool_name: tool_name.to_string(),
                                success: false,
                                output: "User denied command execution".to_string(),
                            }));
                        }

                        let mut perms =
                            crate::permissions::PermissionStore::load().unwrap_or_default();
                        perms.allow_session_for_process(command);
                    }
                }
            }
        }
    }

    Ok(Ok(require_confirmation))
}

/// The directory a command was asked to run in. It has to be a directory
/// inside the workspace; anywhere else is refused before anything runs.
pub(super) fn command_working_dir(
    args: &HashMap<String, String>,
) -> std::result::Result<Option<std::path::PathBuf>, String> {
    let Some(requested) = args
        .get("working_dir")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };
    let dir = crate::path_security::validate_workspace_path(requested)?;
    let workspace = crate::path_security::validation_workspace()
        .canonicalize()
        .map_err(|error| format!("Cannot resolve command workspace: {error}"))?;
    if !dir.starts_with(&workspace) {
        return Err("Working directory is outside the command workspace".to_string());
    }
    if !dir.is_dir() {
        return Err(format!("{requested} is not a directory"));
    }
    Ok(Some(dir))
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

fn policy_waives_confirmation(
    evaluation: &crate::features::exec::exec_policy::CommandEvaluation,
    command: &str,
) -> bool {
    evaluation.every_segment_matched_rule && classify_command(command) != CommandSafety::Dangerous
}

pub(super) fn saved_command_decision(
    perms: &crate::permissions::PermissionStore,
    command: &str,
    safety: CommandSafety,
) -> Option<bool> {
    match perms.check_command_allowing_hook_bypass(command) {
        Some(true) if safety == CommandSafety::Dangerous || perms.asks_before(command) => None,
        decision => decision,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn working_directory_cannot_use_an_additional_root() {
        let workspace = tempfile::tempdir().unwrap();
        let extra = tempfile::tempdir().unwrap();
        let args = HashMap::from([(
            "working_dir".to_string(),
            extra.path().display().to_string(),
        )]);
        let result = crate::path_security::scope_workspace_paths_sync(
            workspace.path().canonicalize().unwrap(),
            vec![extra.path().canonicalize().unwrap()],
            || command_working_dir(&args),
        );
        assert!(result.is_err());
    }

    #[cfg(windows)]
    async fn assert_windows_run_command_refusal(background: bool) {
        use crate::native_process_test_fixture::{
            assert_windows_backend_refusal, windows_refusal_probe, Input, NativeProcessFixture,
        };

        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let fixture = NativeProcessFixture::new();
        fixture
            .scope(async {
                let workspace = tempfile::tempdir().expect("Windows refusal workspace");
                let root = workspace.path().canonicalize().unwrap();
                let probe = windows_refusal_probe(&root, COMMAND_TIMEOUT).await;
                let command = probe.command_string();
                assert_eq!(
                    parse_simple_command(&command),
                    Some(("cmd.exe".to_string(), probe.args.clone()))
                );
                let args = HashMap::from([
                    ("command".to_string(), command),
                    ("run_in_background".to_string(), background.to_string()),
                ]);
                let result = crate::path_security::scope_workspace_paths(
                    Some(root),
                    Vec::new(),
                    execute_run_command(&args, false, None),
                )
                .await
                .expect("Windows refusal must be a tool result");
                assert!(!result.success);
                assert_windows_backend_refusal(&result.output);
                probe.assert_marker_absent();
            })
            .await;
        fixture.assert_inputs(&[
            Input::ExecRules,
            Input::DeviceIdentity,
            Input::ManagedSettings,
        ]);
    }

    #[tokio::test]
    async fn foreground_command_uses_scoped_workspace_by_default() {
        #[cfg(windows)]
        {
            assert_windows_run_command_refusal(false).await;
        }
        #[cfg(not(windows))]
        {
            use crate::native_process_test_fixture::{Input, NativeProcessFixture};

            let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
            NativeProcessFixture::require_backend();
            let fixture = NativeProcessFixture::new();
            fixture
                .scope(async {
                    let workspace = tempfile::tempdir().unwrap();
                    let root = workspace.path().canonicalize().unwrap();
                    let args = HashMap::from([("command".to_string(), "pwd".to_string())]);
                    let result = crate::path_security::scope_workspace_paths(
                        Some(root.clone()),
                        Vec::new(),
                        execute_run_command(&args, false, None),
                    )
                    .await
                    .unwrap();
                    assert!(result.success, "{}", result.output);
                    assert!(result
                        .output
                        .lines()
                        .any(|line| line == root.to_string_lossy()));
                })
                .await;
            fixture.assert_inputs(&[
                Input::ExecRules,
                Input::DeviceIdentity,
                Input::ManagedSettings,
            ]);
        }
    }

    #[tokio::test]
    async fn background_command_uses_scoped_workspace_by_default() {
        #[cfg(windows)]
        {
            assert_windows_run_command_refusal(true).await;
        }
        #[cfg(not(windows))]
        {
            use crate::native_process_test_fixture::{Input, NativeProcessFixture};

            let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
            NativeProcessFixture::require_backend();
            let fixture = NativeProcessFixture::new();
            fixture
                .scope(async {
                    let workspace = tempfile::tempdir().unwrap();
                    let root = workspace.path().canonicalize().unwrap();
                    let args = HashMap::from([
                        ("command".to_string(), "pwd > command-cwd.txt".to_string()),
                        ("run_in_background".to_string(), "true".to_string()),
                    ]);
                    let result = crate::path_security::scope_workspace_paths(
                        Some(root.clone()),
                        Vec::new(),
                        execute_run_command(&args, false, None),
                    )
                    .await
                    .unwrap();
                    assert!(result.success, "{}", result.output);
                    let marker = root.join("command-cwd.txt");
                    for _ in 0..100 {
                        if marker.exists() {
                            break;
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                    }
                    assert_eq!(
                        std::fs::read_to_string(marker).unwrap().trim(),
                        root.to_string_lossy()
                    );
                })
                .await;
            fixture.assert_inputs(&[
                Input::ExecRules,
                Input::DeviceIdentity,
                Input::ManagedSettings,
            ]);
        }
    }

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

    // CI runners can have bwrap installed yet refuse its namespace setup.
    async fn sandbox_executes() -> bool {
        let mut args = HashMap::new();
        args.insert("command".to_string(), "true".to_string());
        matches!(execute_run_command(&args, false, None).await, Ok(r) if r.success)
    }

    #[tokio::test]
    async fn an_argv_execution_treats_a_separator_in_an_operand_as_data() {
        if !sandbox_available() || !sandbox_executes().await {
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
    async fn a_working_dir_outside_the_workspace_or_not_a_directory_is_refused_before_running() {
        let outside = tempfile::tempdir().expect("outside");
        let inside = tempfile::tempdir_in(".").expect("inside");
        let file = inside.path().join("plain.txt");
        std::fs::write(&file, "x").expect("file");
        for (dir, why) in [
            (outside.path().display().to_string(), "outside"),
            (file.display().to_string(), "not a directory"),
        ] {
            let mut args = HashMap::new();
            args.insert("command".to_string(), "touch ran.txt".to_string());
            args.insert("working_dir".to_string(), dir);
            let result = execute_run_command(&args, false, None)
                .await
                .expect("tool result");
            assert!(!result.success, "{why}: {}", result.output);
            assert!(result.output.contains("was not run"), "{}", result.output);
        }
        assert!(!outside.path().join("ran.txt").exists());
        assert!(!inside.path().join("ran.txt").exists());
    }

    #[tokio::test]
    async fn a_command_runs_in_the_working_dir_it_names() {
        if !sandbox_available() || !sandbox_executes().await {
            return;
        }
        let inside = tempfile::tempdir_in(".").expect("inside");
        let package = inside.path().join("package");
        std::fs::create_dir_all(&package).expect("package");
        std::fs::write(package.join("only-here.txt"), "x").expect("marker");

        let mut args = HashMap::new();
        args.insert("command".to_string(), "ls".to_string());
        args.insert("working_dir".to_string(), package.display().to_string());
        let result = execute_run_command(&args, false, None)
            .await
            .expect("tool result");

        assert!(result.success, "{}", result.output);
        assert!(result.output.contains("only-here.txt"), "{}", result.output);
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

    #[test]
    fn a_saved_allow_does_not_skip_the_prompt_for_a_dangerous_command() {
        let mut perms = crate::permissions::PermissionStore::default();
        perms.allow_always("rm");
        perms.allow_always("cargo");
        let dangerous = "rm -rf build";
        assert_eq!(classify_command(dangerous), CommandSafety::Dangerous);
        assert_eq!(
            saved_command_decision(&perms, dangerous, classify_command(dangerous)),
            None
        );
        assert_eq!(
            saved_command_decision(&perms, "cargo build", CommandSafety::Unknown),
            Some(true)
        );
        perms.deny_always("rm");
        assert_eq!(
            saved_command_decision(&perms, dangerous, CommandSafety::Dangerous),
            Some(false)
        );
    }

    #[test]
    fn an_ask_rule_outranks_a_saved_allow_but_not_a_saved_deny() {
        let mut perms = crate::permissions::PermissionStore::default();
        perms.allow_always("cargo publish");
        perms.ask_always("cargo publish");

        assert_eq!(
            saved_command_decision(&perms, "cargo publish --dry-run", CommandSafety::Unknown),
            None
        );

        perms.deny_always("cargo publish");
        assert_eq!(
            saved_command_decision(&perms, "cargo publish", CommandSafety::Unknown),
            Some(false)
        );
    }

    #[test]
    fn an_exec_policy_allow_does_not_skip_force_push_confirmation() {
        use crate::features::exec::exec_policy::evaluate_command;
        use agiworkforce_execpolicy::{Decision, Policy};
        let mut policy = Policy::empty();
        policy
            .add_prefix_rule(&["git".to_string(), "push".to_string()], Decision::Allow)
            .expect("allow rule");
        for command in [
            "git push -f origin main",
            "git push origin main --force",
            "git push -ofoo --force origin main",
            "git push origin +main:main",
            "git push - +main:main",
            "git push --end-of-options origin +main:main",
        ] {
            let evaluation = evaluate_command(&policy, command);
            assert_eq!(evaluation.decision, Decision::Allow, "{command}");
            assert!(evaluation.every_segment_matched_rule, "{command}");
            assert!(
                !policy_waives_confirmation(&evaluation, command),
                "{command}"
            );
        }
        let routine = "git push origin main";
        assert!(policy_waives_confirmation(
            &evaluate_command(&policy, routine),
            routine
        ));
    }

    #[test]
    fn a_saved_allow_does_not_skip_force_push_confirmation() {
        let mut perms = crate::permissions::PermissionStore::default();
        perms.allow_always("git push");
        for command in [
            "git push -f origin main",
            "git push origin main --force",
            "git push -ofoo --force origin main",
            "git push origin +main:main",
            "git push - +main:main",
            "git push --end-of-options origin +main:main",
        ] {
            assert_eq!(
                saved_command_decision(&perms, command, classify_command(command)),
                None,
                "{command}"
            );
        }
        assert_eq!(
            saved_command_decision(
                &perms,
                "git push origin main",
                classify_command("git push origin main")
            ),
            Some(true)
        );
        perms.deny_always("git push");
        assert_eq!(
            saved_command_decision(
                &perms,
                "git push -f origin main",
                classify_command("git push -f origin main")
            ),
            Some(false)
        );
    }

    #[test]
    fn an_exec_policy_allow_does_not_skip_the_prompt_for_a_dangerous_command() {
        use crate::features::exec::exec_policy::evaluate_command;
        use agiworkforce_execpolicy::{Decision, Policy};
        let mut policy = Policy::empty();
        for prefix in [["rm", "-rf"], ["cargo", "build"]] {
            policy
                .add_prefix_rule(&prefix.map(str::to_string), Decision::Allow)
                .expect("allow rule");
        }
        let dangerous = evaluate_command(&policy, "rm -rf build");
        assert_eq!(dangerous.decision, Decision::Allow);
        assert!(!policy_waives_confirmation(&dangerous, "rm -rf build"));
        let routine = evaluate_command(&policy, "cargo build");
        assert!(policy_waives_confirmation(&routine, "cargo build"));
    }
}
