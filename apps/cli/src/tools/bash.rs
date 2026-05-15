use std::collections::HashMap;

use anyhow::Result;
use colored::Colorize;
use dialoguer::Confirm;
use tokio::process::Command;

use crate::safety::{classify_command, CommandSafety};

use super::common::{describe_command, print_tool_status, truncate_output_with_save, COMMAND_TIMEOUT};
use super::ToolResult;

pub(super) async fn execute_run_command(
    args: &HashMap<String, String>,
    require_confirmation: bool,
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

    if require_confirmation {
        let safety = classify_command(command);
        if !matches!(safety, CommandSafety::Safe) {
            let raw_base = command.split_whitespace().next().unwrap_or(command);
            let base_cmd = std::path::Path::new(raw_base)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(raw_base);
            let perms = crate::permissions::PermissionStore::load().unwrap_or_default();

            match perms.check(base_cmd) {
                Some(true) => {
                    // Previously allowed — skip prompt
                }
                Some(false) => {
                    return Ok(ToolResult {
                        tool_name: "run_command".to_string(),
                        success: false,
                        output: format!(
                            "Command '{}' is permanently denied. Use /permissions reset to clear.",
                            base_cmd
                        ),
                    });
                }
                None => {
                    let (prompt_msg, default) = match safety {
                        CommandSafety::Dangerous => {
                            eprintln!(
                                "  {} {}",
                                "DANGEROUS:".red().bold(),
                                describe_command(command).red()
                            );
                            ("This command could be destructive. Allow it?", false)
                        }
                        _ => {
                            eprintln!(
                                "  {} {}",
                                "Command:".yellow(),
                                describe_command(command).dimmed()
                            );
                            ("Allow this command?", true)
                        }
                    };

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

                    let mut perms = crate::permissions::PermissionStore::load().unwrap_or_default();
                    perms.allow_session(base_cmd);
                }
            }
        }
    }

    let sandbox_supported = cfg!(any(target_os = "macos", target_os = "linux"));
    let use_sandbox =
        sandbox_supported && std::env::var("AGIWORKFORCE_NO_SANDBOX").is_err();

    let result: std::result::Result<
        std::result::Result<std::process::Output, std::io::Error>,
        tokio::time::error::Elapsed,
    > = if use_sandbox {
        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let cmd = command.to_string();
        tokio::time::timeout(COMMAND_TIMEOUT, async move {
            let mgr = crate::sandbox::SandboxManager::full_auto(cwd.clone());
            crate::sandbox::execute_sandboxed(&mgr, &cmd, Some(&cwd))
                .await
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
        })
        .await
    } else {
        tokio::time::timeout(
            COMMAND_TIMEOUT,
            Command::new("sh").arg("-c").arg(command).output(),
        )
        .await
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
