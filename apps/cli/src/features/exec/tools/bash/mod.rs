use std::collections::HashMap;

use anyhow::Result;

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
    if let Err(refusal) = approve_command(
        "run_command",
        command,
        details,
        require_confirmation,
        approval_callback,
    )
    .await?
    {
        return Ok(refusal);
    }

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

    let scoped = crate::path_security::validation_workspace();
    let unrestricted = crate::sandbox::sandbox_disabled_for_workspace(&scoped);
    let (cwd, workspace_notice) = if unrestricted {
        (scoped, None)
    } else {
        match command_workspace(scoped) {
            Ok(workspace) => workspace,
            Err(error) => {
                return Ok(ToolResult {
                    tool_name: "run_command".to_string(),
                    success: false,
                    output: format!("Sandbox unavailable ({error:#})."),
                })
            }
        }
    };
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
    let network_notice = (network == crate::sandbox::NetworkPolicy::Deny
        && command_requests_network(command))
    .then(|| network_blocked_notice(require_confirmation));
    let result: std::io::Result<std::process::Output> = {
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
            executed.map_err(command_io_error)
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

    let notice: String = workspace_notice
        .into_iter()
        .chain(network_notice)
        .map(|notice| format!("{notice}\n"))
        .collect();
    match result {
        Ok(output) => Ok(ToolResult {
            tool_name: "run_command".to_string(),
            success: output.status.success(),
            output: format!(
                "{notice}Exit code: {}\n{}",
                exit_description(output.status),
                captured_output(&output.stdout, &output.stderr)
            ),
        }),
        Err(e) if e.kind() != std::io::ErrorKind::TimedOut => Ok(ToolResult {
            tool_name: "run_command".to_string(),
            success: false,
            output: format!("Failed to execute command: {}", e),
        }),
        Err(e) => Ok(ToolResult {
            tool_name: "run_command".to_string(),
            success: false,
            output: timed_out_report(&notice, &e),
        }),
    }
}

fn command_io_error(error: anyhow::Error) -> std::io::Error {
    let kind = error
        .downcast_ref::<std::io::Error>()
        .map(std::io::Error::kind)
        .unwrap_or(std::io::ErrorKind::Other);
    if kind == std::io::ErrorKind::TimedOut {
        return error
            .downcast::<std::io::Error>()
            .unwrap_or_else(|error| std::io::Error::new(kind, error.to_string()));
    }
    std::io::Error::new(kind, error.to_string())
}

fn captured_output(stdout: &[u8], stderr: &[u8]) -> String {
    let stdout = String::from_utf8_lossy(stdout);
    let stderr = String::from_utf8_lossy(stderr);

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

    truncate_output_with_save("run_command", combined)
}

fn timed_out_report(notice: &str, error: &std::io::Error) -> String {
    let headline = format!(
        "{notice}Command timed out after {} seconds and was stopped.",
        COMMAND_TIMEOUT.as_secs()
    );
    match crate::process_tree::TimedOutOutput::of(error) {
        Some(partial) => format!(
            "{headline} Output before the timeout:\n{}",
            captured_output(&partial.stdout, &partial.stderr)
        ),
        None => headline,
    }
}

fn network_blocked_notice(could_ask: bool) -> String {
    if could_ask {
        "The sandbox blocked network access for this command because it was not allowed; \
         a failure to resolve or connect below comes from that."
            .to_string()
    } else {
        "The sandbox blocked network access for this command: this session runs without \
         prompts, so no one could allow it. A failure to resolve or connect below comes from that."
            .to_string()
    }
}

fn exit_description(status: std::process::ExitStatus) -> String {
    if let Some(code) = status.code() {
        return code.to_string();
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        if let Some(signal) = status.signal() {
            return format!("none, killed by signal {signal}");
        }
    }
    "none".to_string()
}

fn internal_destination_refusal(command: &str) -> Option<ToolResult> {
    let host = command_requests_network(command)
        .then(|| internal_destination(command))
        .flatten()?;
    Some(ToolResult {
        tool_name: "run_command".to_string(),
        success: false,
        output: format!(
            "Command '{}' targets {}, which the sandbox blocks: a request the model composes must name a fixed external host, never a service on this machine or a cloud instance-metadata endpoint. Re-run with --no-sandbox only if you accept unrestricted command execution.",
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
    let scoped = crate::path_security::validation_workspace();
    let unrestricted = crate::sandbox::sandbox_disabled_for_workspace(&scoped);
    let (cwd, workspace_notice) = if unrestricted {
        (scoped, None)
    } else {
        match command_workspace(scoped) {
            Ok(workspace) => workspace,
            Err(error) => return Ok(refuse(format!("Sandbox unavailable ({error:#})."))),
        }
    };
    let run_in = working_dir.unwrap_or_else(|| cwd.clone());
    let manager = if unrestricted {
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
    let notice = workspace_notice
        .map(|notice| format!("{notice}\n"))
        .unwrap_or_default();
    Ok(ToolResult {
        tool_name: "run_command".to_string(),
        success: !matches!(output.state, crate::terminals::CommandState::Exited(code) if code != Some(0)),
        output: truncate_output_with_save(
            "run_command",
            format!(
                "{notice}Started {} in the background {how}. Read what it prints or type into it with command_output, and end it with command_stop.\n{}",
                background.id,
                crate::terminals::report(&background, &output)
            ),
        ),
    })
}

/// A session scoped to another workspace keeps it; one in the folder the
/// process started in takes [`crate::sandbox::command_workspace`], which moves
/// a home-folder start to the private agent workspace and says so once.
fn command_workspace(
    scoped: std::path::PathBuf,
) -> anyhow::Result<(std::path::PathBuf, Option<String>)> {
    if std::env::current_dir().ok().as_deref() != Some(scoped.as_path()) {
        return Ok((scoped, None));
    }
    crate::sandbox::command_workspace()
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
            crate::terminals::summary(&crate::terminals::list_owned()),
        ));
    };
    let Some(background) = crate::terminals::find_owned(id) else {
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
                None => {
                    crate::output::confirm("Allow sending input to this running command?", false)
                }
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
    let output = crate::terminals::read_new(&background, command_output_wait(args)).await;
    Ok(result(
        true,
        truncate_output_with_save(
            "command_output",
            crate::terminals::report(&background, &output),
        ),
    ))
}

fn command_output_wait(args: &HashMap<String, String>) -> std::time::Duration {
    args.get("wait_seconds")
        .and_then(|value| value.trim().parse::<f64>().ok())
        .filter(|seconds| seconds.is_finite() && *seconds >= 0.0)
        .map(|seconds| {
            std::time::Duration::from_secs_f64(
                seconds.min(crate::terminals::MAX_WAIT.as_secs_f64()),
            )
        })
        .unwrap_or(crate::terminals::DEFAULT_WAIT)
}

pub(super) async fn execute_command_stop(args: &HashMap<String, String>) -> Result<ToolResult> {
    let result = |success: bool, output: String| ToolResult {
        tool_name: "command_stop".to_string(),
        success,
        output,
    };
    let Some(background) = args
        .get("id")
        .and_then(|id| crate::terminals::find_owned(id))
    else {
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
    require_confirmation: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> Result<std::result::Result<bool, ToolResult>> {
    let policy = crate::features::exec::exec_policy::load_policy()?;
    approve_command_under_policy(
        &policy,
        tool_name,
        command,
        extra_details,
        require_confirmation,
        approval_callback,
    )
    .await
}

async fn approve_command_under_policy(
    policy: &agiworkforce_execpolicy::Policy,
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
    // allow rule, and an explicit prompt rule asks even for a command the
    // heuristics call safe.
    let asks = require_confirmation
        && crate::permissions::PermissionStore::load_or_ask().asks_before(command);
    let policy_requires_approval;
    {
        use crate::features::exec::exec_policy::evaluate_command;
        use agiworkforce_execpolicy::Decision;
        let evaluation = evaluate_command(policy, command);
        policy_requires_approval = evaluation.explicit_prompt_rule;
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
        if policy_requires_approval || asks || !matches!(safety, CommandSafety::Safe) {
            let perms = crate::permissions::PermissionStore::load_or_ask();
            let saved = saved_command_decision(&perms, command, safety)
                .filter(|allowed| !(*allowed && policy_requires_approval));

            match saved {
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
                            !policy_requires_approval
                                && crate::features::exec::exec_policy::can_persist_allow_command(
                                    command,
                                ),
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

                        let mut perms = crate::permissions::PermissionStore::load_or_ask();
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
                                            "Command was approved but its Always Allow rule could not be saved ({error}); the command was not run. Choose Allow Once or Allow for Session to proceed without persistence."
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

                        let confirmed = crate::output::confirm(prompt_msg, default);

                        if !confirmed {
                            return Ok(Err(ToolResult {
                                tool_name: tool_name.to_string(),
                                success: false,
                                output: "User denied command execution".to_string(),
                            }));
                        }

                        let mut perms = crate::permissions::PermissionStore::load_or_ask();
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
    let scope = network_grant_scope(crate::sandbox::SandboxType::detect());
    let request = ApprovalRequest::new(
        ApprovalRequestKind::Network {
            tool_name: "run_command".to_string(),
            destination: scope.to_string(),
        },
        summary,
        vec![describe_command(command)],
    );
    let allowed = match request_approval(approval_callback, request).await {
        Some(decision) => approval_allows(decision),
        None => crate::output::confirm(format!("{summary} Allow it to reach {scope}?"), false),
    };
    if allowed {
        crate::sandbox::NetworkPolicy::AllowExternal
    } else {
        crate::sandbox::NetworkPolicy::Deny
    }
}

fn network_grant_scope(backend: crate::sandbox::SandboxType) -> &'static str {
    match backend {
        crate::sandbox::SandboxType::MacosSeatbelt => {
            "any host except localhost, including your local network and cloud metadata addresses"
        }
        crate::sandbox::SandboxType::LinuxBubblewrap | crate::sandbox::SandboxType::None => {
            "any host, including services on this machine and cloud metadata addresses"
        }
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

    fn wait_for(value: &str) -> std::time::Duration {
        command_output_wait(&HashMap::from([(
            "wait_seconds".to_string(),
            value.to_string(),
        )]))
    }

    #[test]
    fn command_output_wait_is_capped_instead_of_overflowing() {
        let max = crate::terminals::MAX_WAIT;
        for oversized in [
            "1e20",
            "1e300",
            "1.7976931348623157e308",
            "18446744073709551616",
        ] {
            assert_eq!(wait_for(oversized), max, "{oversized}");
        }
        assert_eq!(wait_for("31"), max);
        assert_eq!(wait_for("30"), max);
    }

    #[test]
    fn command_output_wait_keeps_representable_values_and_defaults() {
        assert_eq!(wait_for("0"), std::time::Duration::ZERO);
        assert_eq!(wait_for(" 1.5 "), std::time::Duration::from_secs_f64(1.5));
        for unusable in ["-1", "NaN", "inf", "-inf", "soon", ""] {
            assert_eq!(
                wait_for(unusable),
                crate::terminals::DEFAULT_WAIT,
                "{unusable}"
            );
        }
        assert_eq!(
            command_output_wait(&HashMap::new()),
            crate::terminals::DEFAULT_WAIT
        );
    }

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
                destination: network_grant_scope(crate::sandbox::SandboxType::detect()).to_string(),
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
    fn a_network_grant_names_what_the_sandbox_in_use_leaves_reachable() {
        use crate::sandbox::SandboxType;

        let seatbelt = network_grant_scope(SandboxType::MacosSeatbelt);
        assert!(seatbelt.contains("except localhost"), "{seatbelt}");
        assert!(seatbelt.contains("local network"), "{seatbelt}");
        assert!(seatbelt.contains("cloud metadata"), "{seatbelt}");

        for backend in [SandboxType::LinuxBubblewrap, SandboxType::None] {
            let scope = network_grant_scope(backend);
            assert!(scope.contains("this machine"), "{scope}");
            assert!(scope.contains("cloud metadata"), "{scope}");
            assert!(!scope.contains("except"), "{scope}");
        }
        for backend in [
            SandboxType::MacosSeatbelt,
            SandboxType::LinuxBubblewrap,
            SandboxType::None,
        ] {
            assert!(!network_grant_scope(backend).contains("unreachable"));
        }
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

    #[test]
    fn a_quoted_loopback_operand_is_refused_like_the_plain_one() {
        for command in [
            "curl http://127.0.0.1:3000/",
            "curl http://12'7.0.0.1':3000/",
            "curl \"http://127.0.0.1\":3000/",
        ] {
            assert!(command_requests_network(command), "{command}");
            let refusal = internal_destination_refusal(command).expect("refused");
            assert!(!refusal.success);
            assert!(
                refusal.output.contains("targets 127.0.0.1"),
                "{}",
                refusal.output
            );
        }
        assert!(internal_destination_refusal("curl 'https://api.example.com/v1/models'").is_none());
    }

    #[tokio::test]
    async fn a_quoted_loopback_operand_is_refused_before_the_network_is_asked_for() {
        if !sandbox_available() {
            return;
        }
        let network_requests = Arc::new(Mutex::new(0usize));
        let seen = Arc::clone(&network_requests);
        let callback: ApprovalCallback = Arc::new(move |request: ApprovalRequest| {
            if matches!(request.kind, ApprovalRequestKind::Network { .. }) {
                *seen.lock().expect("count") += 1;
            }
            Box::pin(async { ApprovalDecision::AllowOnce })
        });
        let mut args = HashMap::new();
        args.insert(
            "command".to_string(),
            "curl http://12'7.0.0.1':3000/".to_string(),
        );

        let result = execute_run_command(&args, true, Some(&callback))
            .await
            .expect("tool result");

        assert!(!result.success, "{}", result.output);
        assert!(
            result.output.contains("targets 127.0.0.1"),
            "refusal must name the destination the program would reach: {}",
            result.output
        );
        assert_eq!(*network_requests.lock().expect("count"), 0);
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

    fn counting_callback(
        decision: ApprovalDecision,
    ) -> (ApprovalCallback, Arc<std::sync::atomic::AtomicUsize>) {
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counted = Arc::clone(&calls);
        let callback: ApprovalCallback = Arc::new(move |_| {
            counted.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Box::pin(async move { decision })
        });
        (callback, calls)
    }

    fn policy_with_pwd(
        decision: agiworkforce_execpolicy::Decision,
    ) -> agiworkforce_execpolicy::Policy {
        let mut policy = agiworkforce_execpolicy::Policy::empty();
        policy
            .add_prefix_rule(&["pwd".to_string()], decision)
            .expect("pwd rule");
        policy
    }

    #[tokio::test]
    async fn an_explicit_prompt_rule_asks_before_a_safe_command_and_a_denial_stops_it() {
        use agiworkforce_execpolicy::Decision;
        assert_eq!(classify_command("pwd"), CommandSafety::Safe);
        let policy = policy_with_pwd(Decision::Prompt);
        let evaluation = crate::features::exec::exec_policy::evaluate_command(&policy, "pwd");
        assert!(evaluation.explicit_prompt_rule);

        let (deny, denied_calls) = counting_callback(ApprovalDecision::Deny);
        let refused = approve_command_under_policy(
            &policy,
            "run_command",
            "pwd",
            Vec::new(),
            true,
            Some(&deny),
        )
        .await
        .expect("approval")
        .expect_err("a denied prompt rule must refuse");
        assert_eq!(denied_calls.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert!(!refused.success);
        assert_eq!(refused.output, "User denied command execution");

        let (allow, allowed_calls) = counting_callback(ApprovalDecision::AllowOnce);
        let approved = approve_command_under_policy(
            &policy,
            "run_command",
            "pwd",
            Vec::new(),
            false,
            Some(&allow),
        )
        .await
        .expect("approval");
        assert_eq!(allowed_calls.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert!(matches!(approved, Ok(true)));
    }

    #[tokio::test]
    async fn a_safe_command_without_a_prompt_rule_keeps_running_without_a_request() {
        use agiworkforce_execpolicy::{Decision, Policy};
        for policy in [Policy::empty(), policy_with_pwd(Decision::Allow)] {
            let evaluation = crate::features::exec::exec_policy::evaluate_command(&policy, "pwd");
            assert!(!evaluation.explicit_prompt_rule);
            let (callback, calls) = counting_callback(ApprovalDecision::Deny);
            let outcome = approve_command_under_policy(
                &policy,
                "run_command",
                "pwd",
                Vec::new(),
                true,
                Some(&callback),
            )
            .await
            .expect("approval");
            assert!(outcome.is_ok());
            assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 0);
        }

        let forbidden = policy_with_pwd(Decision::Forbidden);
        let (callback, calls) = counting_callback(ApprovalDecision::AllowOnce);
        let refused = approve_command_under_policy(
            &forbidden,
            "run_command",
            "pwd",
            Vec::new(),
            true,
            Some(&callback),
        )
        .await
        .expect("approval")
        .expect_err("a forbidden rule must refuse");
        assert!(refused.output.contains("forbidden"));
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 0);
    }

    #[test]
    fn a_fallback_prompt_is_not_an_explicit_prompt_rule() {
        let policy = agiworkforce_execpolicy::Policy::empty();
        let evaluation =
            crate::features::exec::exec_policy::evaluate_command(&policy, "echo 'open");
        assert!(!evaluation.explicit_prompt_rule);
    }

    #[cfg(unix)]
    #[test]
    fn a_command_killed_by_a_signal_names_the_signal() {
        use std::os::unix::process::ExitStatusExt;
        assert_eq!(
            exit_description(std::process::ExitStatus::from_raw(11)),
            "none, killed by signal 11"
        );
        assert_eq!(
            exit_description(std::process::ExitStatus::from_raw(256)),
            "1"
        );
    }

    #[test]
    fn a_timed_out_command_reports_the_output_it_had_produced() {
        let sandboxed = anyhow::Error::new(std::io::Error::new(
            std::io::ErrorKind::TimedOut,
            crate::process_tree::TimedOutOutput {
                stdout: b"started\n".to_vec(),
                stderr: b"still compiling\n".to_vec(),
            },
        ))
        .context("Seatbelt exec failed");

        let error = command_io_error(sandboxed);
        let report = timed_out_report("", &error);

        assert_eq!(error.kind(), std::io::ErrorKind::TimedOut);
        assert!(
            report.starts_with(&format!(
                "Command timed out after {} seconds and was stopped. Output before the timeout:\n",
                COMMAND_TIMEOUT.as_secs()
            )),
            "{report}"
        );
        assert!(report.contains("started\n"), "{report}");
        assert!(report.contains("[stderr]\nstill compiling"), "{report}");

        let bare = std::io::Error::new(std::io::ErrorKind::TimedOut, "subprocess timed out");
        assert!(!timed_out_report("", &bare).contains("Output before the timeout"));
    }

    #[test]
    fn a_saved_allow_does_not_cover_a_longer_command_that_discards_work() {
        let mut perms = crate::permissions::PermissionStore::default();
        perms.allow_always("git stash");
        perms.allow_always("git checkout main");
        for command in [
            "git stash clear",
            "git stash drop",
            "git checkout main -- .",
        ] {
            assert_eq!(
                saved_command_decision(&perms, command, classify_command(command)),
                None,
                "{command}"
            );
        }
        assert_eq!(
            saved_command_decision(&perms, "git stash", classify_command("git stash")),
            Some(true)
        );
    }

    #[tokio::test]
    async fn a_network_command_says_when_the_sandbox_blocked_its_network() {
        if !sandbox_available() || !sandbox_executes().await {
            return;
        }
        let mut args = HashMap::new();
        args.insert("command".to_string(), "curl --version".to_string());

        let unasked = execute_run_command(&args, false, None)
            .await
            .expect("tool result");
        assert!(
            unasked.output.contains("no one could allow it"),
            "{}",
            unasked.output
        );

        let network_requests = Arc::new(Mutex::new(0usize));
        let seen = Arc::clone(&network_requests);
        let callback: ApprovalCallback = Arc::new(move |request: ApprovalRequest| {
            let network = matches!(request.kind, ApprovalRequestKind::Network { .. });
            if network {
                *seen.lock().expect("count") += 1;
            }
            Box::pin(async move {
                if network {
                    ApprovalDecision::Deny
                } else {
                    ApprovalDecision::AllowOnce
                }
            })
        });
        let declined = execute_run_command(&args, true, Some(&callback))
            .await
            .expect("tool result");
        assert_eq!(*network_requests.lock().expect("count"), 1);
        assert!(
            declined.output.contains("because it was not allowed"),
            "{}",
            declined.output
        );
    }
}
