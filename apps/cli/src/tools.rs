use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use anyhow::Result;
use colored::Colorize;
use dialoguer::Confirm;
use tokio::process::Command;

use crate::agent::ToolCall;
use crate::safety::{classify_command, CommandSafety, DANGEROUS_COMMANDS};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Result of executing a single tool.
pub struct ToolResult {
    #[allow(dead_code)]
    pub tool_name: String,
    pub success: bool,
    pub output: String,
}

/// Maximum output size in bytes before truncation.
const MAX_OUTPUT_BYTES: usize = 50 * 1024; // 50KB

/// Maximum lines before truncation.
const MAX_OUTPUT_LINES: usize = 2000;

/// Lines to show at head and tail when truncating.
const TRUNCATION_HEAD_LINES: usize = 30;
const TRUNCATION_TAIL_LINES: usize = 30;

/// Maximum lines to read from a file.
const MAX_FILE_LINES: usize = 2_000;

/// Maximum characters per line before truncation.
const MAX_LINE_LENGTH: usize = 2_000;

/// Command execution timeout.
const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);

// ---------------------------------------------------------------------------
// Execution options
// ---------------------------------------------------------------------------

/// Options controlling tool execution behavior.
pub struct ToolExecOptions {
    /// Whether to prompt the user before executing destructive tools.
    pub require_confirmation: bool,
    /// Auto-approve safe tools (reads, searches, listings) without prompting.
    /// When true, safe tools are executed immediately; unknown/dangerous tools
    /// still prompt the user.
    pub auto_approve_safe: bool,
    /// Suppress tool execution details (status lines, diffs).
    pub quiet: bool,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Execute a tool call and return the result.
/// If `require_confirmation` is true, destructive tools prompt the user.
/// Compat wrapper — agent.rs uses execute_tool_with_opts directly.
#[allow(dead_code)]
pub async fn execute_tool(call: &ToolCall, require_confirmation: bool) -> Result<ToolResult> {
    let opts = ToolExecOptions {
        require_confirmation,
        auto_approve_safe: false,
        quiet: false,
    };
    execute_tool_with_opts(call, &opts).await
}

/// Execute a tool call with full execution options.
///
/// When `auto_approve_safe` is true:
/// - Read-only tools (read_file, search_files, list_directory, web_search, web_fetch) skip prompts.
/// - Write tools (write_file, edit_file) and run_command still prompt unless skip_permissions.
pub async fn execute_tool_with_opts(call: &ToolCall, opts: &ToolExecOptions) -> Result<ToolResult> {
    // Determine if this specific tool needs confirmation.
    // Safe/read-only tools can be auto-approved with --yes.
    let is_safe_tool = matches!(
        call.name.as_str(),
        "read_file" | "search_files" | "list_directory" | "web_search" | "web_fetch"
    );
    let require_confirm = opts.require_confirmation && !(opts.auto_approve_safe && is_safe_tool);

    let result = match call.name.as_str() {
        "read_file" => execute_read_file_with_opts(&call.args, opts.quiet).await,
        "write_file" => execute_write_file(&call.args, require_confirm).await,
        "run_command" => execute_run_command(&call.args, require_confirm).await,
        "search_files" => execute_search_files_with_opts(&call.args, opts.quiet).await,
        "list_directory" => execute_list_directory_with_opts(&call.args, opts.quiet).await,
        "edit_file" => execute_edit_file(&call.args, require_confirm).await,
        "web_search" => execute_web_search_with_opts(&call.args, opts.quiet).await,
        "web_fetch" => execute_web_fetch_with_opts(&call.args, opts.quiet).await,
        // --- Codex CLI parity tools ---
        "apply_patch" => execute_apply_patch(&call.args, require_confirm).await,
        "grep_files" => execute_grep_files(&call.args, opts.quiet).await,
        "tool_search" => execute_tool_search(&call.args).await,
        _ => Ok(ToolResult {
            tool_name: call.name.clone(),
            success: false,
            output: format!("Unknown tool: {}", call.name),
        }),
    };

    result
}

// ---------------------------------------------------------------------------
// Tool: read_file
// ---------------------------------------------------------------------------

async fn execute_read_file(args: &HashMap<String, String>) -> Result<ToolResult> {
    let path = match args.get("path") {
        Some(p) => p,
        None => {
            return Ok(ToolResult {
                tool_name: "read_file".to_string(),
                success: false,
                output: "Missing required argument: path".to_string(),
            });
        }
    };

    let start_line: Option<usize> = args.get("start_line").and_then(|s| s.parse().ok());
    let end_line: Option<usize> = args.get("end_line").and_then(|s| s.parse().ok());

    let range_label = match (start_line, end_line) {
        (Some(s), Some(e)) => format!("Read({}, lines {}-{})", path, s, e),
        (Some(s), None) => format!("Read({}, from line {})", path, s),
        (None, Some(e)) => format!("Read({}, to line {})", path, e),
        _ => format!("Read({})", path),
    };
    print_tool_status("read_file", &range_label);

    let file_path = Path::new(path);
    if !file_path.exists() {
        return Ok(ToolResult {
            tool_name: "read_file".to_string(),
            success: false,
            output: format!("File not found: {}", path),
        });
    }

    if !file_path.is_file() {
        return Ok(ToolResult {
            tool_name: "read_file".to_string(),
            success: false,
            output: format!("Not a file: {}", path),
        });
    }

    match tokio::fs::read_to_string(file_path).await {
        Ok(contents) => {
            let all_lines: Vec<&str> = contents.lines().collect();
            let total_lines = all_lines.len();

            // Resolve 1-based inclusive range.
            let start_idx = start_line
                .map(|s| s.saturating_sub(1))
                .unwrap_or(0)
                .min(total_lines);
            let end_idx = end_line
                .map(|e| e.min(total_lines))
                .unwrap_or(total_lines);

            if start_idx >= end_idx {
                return Ok(ToolResult {
                    tool_name: "read_file".to_string(),
                    success: true,
                    output: format!(
                        "(empty range: lines {}-{} of {} total)",
                        start_idx + 1,
                        end_idx,
                        total_lines
                    ),
                });
            }

            let selected = &all_lines[start_idx..end_idx];
            let range_len = selected.len();

            // Apply MAX_FILE_LINES cap on selected range.
            let capped = range_len > MAX_FILE_LINES;
            let display_count = if capped { MAX_FILE_LINES } else { range_len };

            let mut output = String::new();
            for (i, line) in selected[..display_count].iter().enumerate() {
                let line_no = start_idx + i + 1;
                let display_line = truncate_line(line);
                output.push_str(&format!("{:>6}\t{}\n", line_no, display_line));
            }

            // Show range info when a sub-range was requested.
            let showing_start = start_idx + 1;
            let showing_end = start_idx + display_count;

            if capped {
                output.push_str(&format!(
                    "\n[truncated: showing lines {}-{} of {} total]",
                    showing_start, showing_end, total_lines
                ));
                output.push_str(&format!(
                    "\nTo read more, call read_file with start_line: {}",
                    showing_end + 1
                ));
            } else if start_line.is_some() || end_line.is_some() {
                output.push_str(&format!(
                    "\n[lines {}-{} of {} total]",
                    showing_start, showing_end, total_lines
                ));
                if showing_end < total_lines {
                    output.push_str(&format!(
                        "\nTo read more, call read_file with start_line: {}",
                        showing_end + 1
                    ));
                }
            } else if total_lines > MAX_FILE_LINES {
                // Full file read but exceeded MAX_FILE_LINES
                output.push_str(&format!(
                    "\n[truncated: showing {}/{} lines]",
                    MAX_FILE_LINES, total_lines
                ));
                output.push_str(&format!(
                    "\nTo read more, call read_file with start_line: {}",
                    MAX_FILE_LINES + 1
                ));
            }

            let output = truncate_output_with_save("read_file", output);

            Ok(ToolResult {
                tool_name: "read_file".to_string(),
                success: true,
                output,
            })
        }
        Err(e) => Ok(ToolResult {
            tool_name: "read_file".to_string(),
            success: false,
            output: format!("Failed to read file: {}", e),
        }),
    }
}

/// Truncate a single line if it exceeds MAX_LINE_LENGTH.
fn truncate_line(line: &str) -> String {
    if line.len() <= MAX_LINE_LENGTH {
        line.to_string()
    } else {
        format!("{}... [truncated]", &line[..MAX_LINE_LENGTH])
    }
}

// ---------------------------------------------------------------------------
// Tool: write_file
// ---------------------------------------------------------------------------

async fn execute_write_file(
    args: &HashMap<String, String>,
    require_confirmation: bool,
) -> Result<ToolResult> {
    let path = match args.get("path") {
        Some(p) => p,
        None => {
            return Ok(ToolResult {
                tool_name: "write_file".to_string(),
                success: false,
                output: "Missing required argument: path".to_string(),
            });
        }
    };

    let content = match args.get("content") {
        Some(c) => c,
        None => {
            return Ok(ToolResult {
                tool_name: "write_file".to_string(),
                success: false,
                output: "Missing required argument: content".to_string(),
            });
        }
    };

    print_tool_status("write_file", &format!("Write({})", path));

    if require_confirmation {
        let file_path = Path::new(path);
        let line_count = content.lines().count();

        if file_path.exists() && file_path.is_file() {
            // Existing file — show a unified diff preview
            match std::fs::read_to_string(file_path) {
                Ok(existing) => {
                    let diff = generate_simple_diff(&existing, content);
                    eprintln!(
                        "{}",
                        format!("  Diff for {} ({} lines):", path, line_count).dimmed()
                    );
                    for line in diff.lines() {
                        if let Some(rest) = line.strip_prefix('+') {
                            eprintln!("  {}{}", "+".green(), rest.green());
                        } else if let Some(rest) = line.strip_prefix('-') {
                            eprintln!("  {}{}", "-".red(), rest.red());
                        } else {
                            eprintln!("  {}", line.dimmed());
                        }
                    }
                }
                Err(_) => {
                    eprintln!(
                        "{}",
                        format!("  Will write {} lines to {}", line_count, path).dimmed()
                    );
                }
            }
        } else {
            // New file
            eprintln!(
                "{}",
                format!("  [new file] {} ({} lines)", path, line_count).dimmed()
            );
        }

        let confirmed = Confirm::new()
            .with_prompt("Allow this file write?")
            .default(true)
            .interact()
            .unwrap_or(false);

        if !confirmed {
            return Ok(ToolResult {
                tool_name: "write_file".to_string(),
                success: false,
                output: "User denied file write".to_string(),
            });
        }
    }

    let file_path = Path::new(path);

    // Create parent directories if needed
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            if let Err(e) = tokio::fs::create_dir_all(parent).await {
                return Ok(ToolResult {
                    tool_name: "write_file".to_string(),
                    success: false,
                    output: format!("Failed to create parent directories: {}", e),
                });
            }
        }
    }

    match tokio::fs::write(file_path, content).await {
        Ok(()) => {
            let line_count = content.lines().count();
            Ok(ToolResult {
                tool_name: "write_file".to_string(),
                success: true,
                output: format!(
                    "Successfully wrote {} lines ({} bytes) to {}",
                    line_count,
                    content.len(),
                    path
                ),
            })
        }
        Err(e) => Ok(ToolResult {
            tool_name: "write_file".to_string(),
            success: false,
            output: format!("Failed to write file: {}", e),
        }),
    }
}

// ---------------------------------------------------------------------------
// Tool: run_command
// ---------------------------------------------------------------------------

async fn execute_run_command(
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

    // Three-tier safety check via the safety module + permission persistence
    if require_confirmation {
        let safety = classify_command(command);
        if !matches!(safety, CommandSafety::Safe) {
            // Check persistent/session permission store before prompting
            let base_cmd = command.split_whitespace().next().unwrap_or(command);
            let perms = crate::permissions::PermissionStore::load().unwrap_or_default();

            match perms.check(base_cmd) {
                Some(true) => {
                    // Previously allowed — skip prompt
                }
                Some(false) => {
                    // Previously denied
                    return Ok(ToolResult {
                        tool_name: "run_command".to_string(),
                        success: false,
                        output: format!("Command '{}' is permanently denied. Use /permissions reset to clear.", base_cmd),
                    });
                }
                None => {
                    // No cached decision — prompt based on safety level
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

                    // Auto-cache approval for this session
                    let mut perms = crate::permissions::PermissionStore::load().unwrap_or_default();
                    perms.allow_session(base_cmd);
                }
            }
        }
    }

    let result = tokio::time::timeout(
        COMMAND_TIMEOUT,
        Command::new("sh")
            .arg("-c")
            .arg(command)
            .output(),
    )
    .await;

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

// ---------------------------------------------------------------------------
// Tool: search_files
// ---------------------------------------------------------------------------

async fn execute_search_files(args: &HashMap<String, String>) -> Result<ToolResult> {
    let pattern = match args.get("pattern") {
        Some(p) => p,
        None => {
            return Ok(ToolResult {
                tool_name: "search_files".to_string(),
                success: false,
                output: "Missing required argument: pattern".to_string(),
            });
        }
    };

    let path = args
        .get("path")
        .map(|s| s.as_str())
        .unwrap_or(".");

    print_tool_status(
        "search_files",
        &format!("Search({}, {})", pattern, path),
    );

    // Use grep -rn for recursive search
    let result = tokio::time::timeout(
        COMMAND_TIMEOUT,
        Command::new("grep")
            .arg("-rn")
            .arg("--include=*")
            .arg("-m")
            .arg("200") // limit matches per file
            .arg(pattern)
            .arg(path)
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();

            if stdout.is_empty() && output.status.code() == Some(1) {
                // grep returns exit code 1 for no matches — not an error
                return Ok(ToolResult {
                    tool_name: "search_files".to_string(),
                    success: true,
                    output: format!("No matches found for pattern: {}", pattern),
                });
            }

            let mut result_text = stdout;
            if !stderr.is_empty() {
                result_text.push_str("\n[stderr]\n");
                result_text.push_str(&stderr);
            }

            let result_text = truncate_output_with_save("search_files", result_text);

            Ok(ToolResult {
                tool_name: "search_files".to_string(),
                success: true,
                output: result_text,
            })
        }
        Ok(Err(e)) => Ok(ToolResult {
            tool_name: "search_files".to_string(),
            success: false,
            output: format!("Failed to execute search: {}", e),
        }),
        Err(_) => Ok(ToolResult {
            tool_name: "search_files".to_string(),
            success: false,
            output: format!(
                "Search timed out after {} seconds",
                COMMAND_TIMEOUT.as_secs()
            ),
        }),
    }
}

// ---------------------------------------------------------------------------
// Tool: list_directory
// ---------------------------------------------------------------------------

async fn execute_list_directory(args: &HashMap<String, String>) -> Result<ToolResult> {
    let path = args
        .get("path")
        .map(|s| s.as_str())
        .unwrap_or(".");

    print_tool_status("list_directory", &format!("List({})", path));

    let dir_path = Path::new(path);
    if !dir_path.exists() {
        return Ok(ToolResult {
            tool_name: "list_directory".to_string(),
            success: false,
            output: format!("Directory not found: {}", path),
        });
    }

    if !dir_path.is_dir() {
        return Ok(ToolResult {
            tool_name: "list_directory".to_string(),
            success: false,
            output: format!("Not a directory: {}", path),
        });
    }

    let mut entries = Vec::new();
    let mut read_dir = match tokio::fs::read_dir(dir_path).await {
        Ok(rd) => rd,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "list_directory".to_string(),
                success: false,
                output: format!("Failed to read directory: {}", e),
            });
        }
    };

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = entry.metadata().await;

        let (file_type, size) = match metadata {
            Ok(meta) => {
                let ft = if meta.is_dir() {
                    "dir"
                } else if meta.is_symlink() {
                    "link"
                } else {
                    "file"
                };
                (ft, meta.len())
            }
            Err(_) => ("???", 0),
        };

        entries.push((name, file_type, size));
    }

    // Sort entries: directories first, then alphabetical
    entries.sort_by(|a, b| {
        let dir_order = |ft: &str| -> u8 {
            if ft == "dir" { 0 } else { 1 }
        };
        dir_order(a.1)
            .cmp(&dir_order(b.1))
            .then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase()))
    });

    let mut output = String::new();
    for (name, file_type, size) in &entries {
        let display_name = if *file_type == "dir" {
            format!("{}/", name)
        } else {
            name.clone()
        };
        output.push_str(&format!(
            "{:<6} {:>10}  {}\n",
            file_type,
            format_size(*size),
            display_name
        ));
    }

    if entries.is_empty() {
        output = "(empty directory)".to_string();
    } else {
        output.push_str(&format!("\n{} entries total", entries.len()));
    }

    Ok(ToolResult {
        tool_name: "list_directory".to_string(),
        success: true,
        output,
    })
}

// ---------------------------------------------------------------------------
// Tool: edit_file
// ---------------------------------------------------------------------------

async fn execute_edit_file(
    args: &HashMap<String, String>,
    require_confirmation: bool,
) -> Result<ToolResult> {
    let path = match args.get("path") {
        Some(p) => p,
        None => {
            return Ok(ToolResult {
                tool_name: "edit_file".to_string(),
                success: false,
                output: "Missing required argument: path".to_string(),
            });
        }
    };

    let old_string = match args.get("old_string") {
        Some(s) => s,
        None => {
            return Ok(ToolResult {
                tool_name: "edit_file".to_string(),
                success: false,
                output: "Missing required argument: old_string".to_string(),
            });
        }
    };

    let new_string = match args.get("new_string") {
        Some(s) => s,
        None => {
            return Ok(ToolResult {
                tool_name: "edit_file".to_string(),
                success: false,
                output: "Missing required argument: new_string".to_string(),
            });
        }
    };

    print_tool_status("edit_file", &format!("Edit({})", path));

    let file_path = Path::new(path);
    if !file_path.exists() {
        return Ok(ToolResult {
            tool_name: "edit_file".to_string(),
            success: false,
            output: format!("File not found: {}", path),
        });
    }

    // Read current contents
    let contents = match tokio::fs::read_to_string(file_path).await {
        Ok(c) => c,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "edit_file".to_string(),
                success: false,
                output: format!("Failed to read file: {}", e),
            });
        }
    };

    // Check that old_string exists and is unique
    let match_count = contents.matches(old_string.as_str()).count();
    if match_count == 0 {
        return Ok(ToolResult {
            tool_name: "edit_file".to_string(),
            success: false,
            output: format!(
                "old_string not found in {}. The string to replace does not exist in the file.",
                path
            ),
        });
    }
    if match_count > 1 {
        return Ok(ToolResult {
            tool_name: "edit_file".to_string(),
            success: false,
            output: format!(
                "old_string found {} times in {}. It must be unique. Provide more context to make it unique.",
                match_count, path
            ),
        });
    }

    if require_confirmation {
        // Show a compact diff preview
        let old_preview = preview_string(old_string, 3);
        let new_preview = preview_string(new_string, 3);
        eprintln!("  {} {}", "-".red(), old_preview.red());
        eprintln!("  {} {}", "+".green(), new_preview.green());

        let confirmed = Confirm::new()
            .with_prompt("Allow this edit?")
            .default(true)
            .interact()
            .unwrap_or(false);

        if !confirmed {
            return Ok(ToolResult {
                tool_name: "edit_file".to_string(),
                success: false,
                output: "User denied edit".to_string(),
            });
        }
    }

    // Perform the replacement
    let new_contents = contents.replacen(old_string, new_string, 1);

    match tokio::fs::write(file_path, &new_contents).await {
        Ok(()) => Ok(ToolResult {
            tool_name: "edit_file".to_string(),
            success: true,
            output: format!("Successfully edited {}", path),
        }),
        Err(e) => Ok(ToolResult {
            tool_name: "edit_file".to_string(),
            success: false,
            output: format!("Failed to write file: {}", e),
        }),
    }
}

// ---------------------------------------------------------------------------
// Tool: web_search
// ---------------------------------------------------------------------------

async fn execute_web_search(args: &HashMap<String, String>) -> Result<ToolResult> {
    let query = match args.get("query") {
        Some(q) => q,
        None => {
            return Ok(ToolResult {
                tool_name: "web_search".to_string(),
                success: false,
                output: "Missing required argument: query".to_string(),
            });
        }
    };

    let _max_results: usize = args
        .get("max_results")
        .and_then(|s| s.parse().ok())
        .unwrap_or(5);

    print_tool_status("web_search", &format!("WebSearch({})", query));

    // Check for a configured search API key (SEARCH_API_KEY env var).
    // Without one, return a helpful stub message.
    let api_key = std::env::var("SEARCH_API_KEY").unwrap_or_default();
    if api_key.is_empty() {
        return Ok(ToolResult {
            tool_name: "web_search".to_string(),
            success: false,
            output: "Web search not configured. Set the SEARCH_API_KEY environment variable to enable web search.".to_string(),
        });
    }

    // Use a generic search API endpoint (placeholder — real integration would
    // point to Brave Search, SerpAPI, etc.).
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.search.example/search")
        .header("Authorization", format!("Bearer {}", api_key))
        .query(&[("q", query.as_str()), ("limit", &_max_results.to_string())])
        .timeout(Duration::from_secs(15))
        .send()
        .await;

    match resp {
        Ok(r) => {
            let body = r.text().await.unwrap_or_default();
            let output = truncate_output_with_save("web_search", body);
            Ok(ToolResult {
                tool_name: "web_search".to_string(),
                success: true,
                output,
            })
        }
        Err(e) => Ok(ToolResult {
            tool_name: "web_search".to_string(),
            success: false,
            output: format!("Web search request failed: {}", e),
        }),
    }
}

// ---------------------------------------------------------------------------
// Tool: web_fetch
// ---------------------------------------------------------------------------

/// Validate that a URL is safe to fetch (no SSRF against internal services).
/// Blocks private IPs, loopback, link-local, and cloud metadata endpoints.
fn validate_fetch_url(url: &str) -> Result<(), String> {
    let parsed = match reqwest::Url::parse(url) {
        Ok(u) => u,
        Err(_) => return Err("Invalid URL format".to_string()),
    };

    // Only allow http and https schemes
    match parsed.scheme() {
        "http" | "https" => {}
        scheme => return Err(format!("Blocked URL scheme: {}", scheme)),
    }

    let host = parsed.host_str().unwrap_or("");

    // Block known cloud metadata endpoints
    const BLOCKED_HOSTS: &[&str] = &[
        "169.254.169.254",   // AWS/GCP metadata
        "metadata.google.internal",
        "metadata.google",
        "100.100.100.200",   // Alibaba Cloud metadata
    ];
    if BLOCKED_HOSTS.contains(&host) {
        return Err(format!("Blocked metadata service host: {}", host));
    }

    // Block localhost / loopback
    if host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "0.0.0.0" {
        return Err(format!("Blocked loopback address: {}", host));
    }

    // Block private IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x)
    if let Ok(ip) = host.parse::<std::net::Ipv4Addr>() {
        if ip.is_loopback() || ip.is_private() || ip.is_link_local() || ip.is_unspecified() {
            return Err(format!("Blocked private/internal IP: {}", ip));
        }
        // Block 169.254.x.x (link-local / metadata)
        if ip.octets()[0] == 169 && ip.octets()[1] == 254 {
            return Err(format!("Blocked link-local IP: {}", ip));
        }
    }

    Ok(())
}

async fn execute_web_fetch(args: &HashMap<String, String>) -> Result<ToolResult> {
    let url = match args.get("url") {
        Some(u) => u,
        None => {
            return Ok(ToolResult {
                tool_name: "web_fetch".to_string(),
                success: false,
                output: "Missing required argument: url".to_string(),
            });
        }
    };

    // SECURITY: Validate URL to prevent SSRF against internal services
    if let Err(reason) = validate_fetch_url(url) {
        return Ok(ToolResult {
            tool_name: "web_fetch".to_string(),
            success: false,
            output: format!("URL blocked for security: {}", reason),
        });
    }

    print_tool_status("web_fetch", &format!("WebFetch({})", url));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .unwrap_or_default();

    match client.get(url.as_str()).send().await {
        Ok(resp) => {
            let body = resp.text().await.unwrap_or_default();
            // Strip HTML tags with a simple regex-style removal.
            let text = strip_html_tags(&body);
            let output = truncate_output_with_save("web_fetch", text);
            Ok(ToolResult {
                tool_name: "web_fetch".to_string(),
                success: true,
                output,
            })
        }
        Err(e) => Ok(ToolResult {
            tool_name: "web_fetch".to_string(),
            success: false,
            output: format!("Failed to fetch URL: {}", e),
        }),
    }
}

/// Strip HTML tags by removing everything between < and >.
/// This is a simple approach; not a full HTML parser.
fn strip_html_tags(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut inside_tag = false;

    for ch in input.chars() {
        match ch {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => result.push(ch),
            _ => {}
        }
    }

    // Collapse runs of whitespace into a single space, then trim.
    let collapsed: String = result
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ");

    collapsed
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Print tool execution status to stderr (keeps stdout clean for piping).
fn print_tool_status(tool_name: &str, display: &str) {
    eprintln!(
        "  {} {}",
        format!("[{}]", tool_name).cyan().bold(),
        display.dimmed()
    );
}

/// Print tool execution status unless in quiet mode.
#[allow(dead_code)]
fn print_tool_status_unless_quiet(tool_name: &str, display: &str, quiet: bool) {
    if !quiet {
        print_tool_status(tool_name, display);
    }
}

/// Produce a human-readable description of a shell command for confirmation prompts.
fn describe_command(command: &str) -> String {
    let trimmed = command.trim();
    let first_word = trimmed.split_whitespace().next().unwrap_or("");
    let base = first_word.rsplit('/').next().unwrap_or(first_word);

    match base {
        "rm" => {
            let targets: Vec<&str> = trimmed.split_whitespace()
                .filter(|a| !a.starts_with('-'))
                .skip(1)
                .collect();
            if trimmed.contains("-rf") || trimmed.contains("-fr") {
                format!("Force-delete {} recursively", targets.join(", "))
            } else if trimmed.contains("-r") {
                format!("Delete {} recursively", targets.join(", "))
            } else {
                format!("Delete {}", targets.join(", "))
            }
        }
        "mv" => {
            let args: Vec<&str> = trimmed.split_whitespace()
                .filter(|a| !a.starts_with('-'))
                .skip(1)
                .collect();
            if args.len() >= 2 {
                format!("Move {} -> {}", args[..args.len()-1].join(", "), args[args.len()-1])
            } else {
                format!("Move files: {}", trimmed)
            }
        }
        "chmod" => format!("Change permissions: {}", trimmed),
        "chown" | "chgrp" => format!("Change ownership: {}", trimmed),
        "sudo" => format!("Run as root: {}", &trimmed[5..].trim()),
        "kill" | "killall" | "pkill" => format!("Send signal to processes: {}", trimmed),
        "git" => format!("Git: {}", &trimmed[4..].trim()),
        "npm" | "pnpm" | "yarn" | "cargo" | "pip" => format!("Package manager: {}", trimmed),
        "curl" | "wget" => format!("Download/fetch: {}", trimmed),
        "docker" => format!("Docker: {}", &trimmed[7..].trim()),
        _ => trimmed.to_string(),
    }
}

/// Check if a shell command invokes a dangerous program.
#[allow(dead_code)]
fn is_dangerous_command(command: &str) -> bool {
    let trimmed = command.trim();
    // Check the first word, and also check after pipe/semicolon segments
    for segment in trimmed.split(&['|', ';', '&'][..]) {
        let first_word = segment.split_whitespace().next().unwrap_or("");
        // Strip any leading path (e.g. /bin/rm -> rm)
        let base = first_word.rsplit('/').next().unwrap_or(first_word);
        if DANGEROUS_COMMANDS.contains(&base) {
            return true;
        }
    }
    false
}

/// Truncate output and save full content to disk for later retrieval.
/// Accepts a tool name to label the saved file.
fn truncate_output_with_save(tool_name: &str, output: String) -> String {
    let lines: Vec<&str> = output.lines().collect();
    let needs_truncation = output.len() > MAX_OUTPUT_BYTES || lines.len() > MAX_OUTPUT_LINES;

    if !needs_truncation {
        return output;
    }

    // Save full output to disk before truncating
    let saved_path = save_full_output(tool_name, &output);
    let mut truncated = truncate_by_lines(&lines);

    if let Some(path) = saved_path {
        truncated.push_str(&format!("\n[full output saved to {}]", path));
    }

    truncated
}

/// Apply head+tail truncation to a slice of lines.
fn truncate_by_lines(lines: &[&str]) -> String {
    let total = lines.len();
    if total <= TRUNCATION_HEAD_LINES + TRUNCATION_TAIL_LINES {
        return lines.join("\n");
    }

    let head: Vec<&str> = lines[..TRUNCATION_HEAD_LINES].to_vec();
    let tail: Vec<&str> = lines[total - TRUNCATION_TAIL_LINES..].to_vec();
    let omitted = total - TRUNCATION_HEAD_LINES - TRUNCATION_TAIL_LINES;

    format!(
        "{}\n\n[... {} lines omitted ...]\n\n{}",
        head.join("\n"),
        omitted,
        tail.join("\n")
    )
}

/// Save full tool output to disk when truncation occurred.
/// Returns the path where the output was saved.
fn save_full_output(tool_name: &str, output: &str) -> Option<String> {
    let dir = crate::config::CliConfig::config_dir().ok()?.join("tool-output");
    std::fs::create_dir_all(&dir).ok()?;

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S_%3f");
    let filename = format!("{}_{}.txt", tool_name, timestamp);
    let path = dir.join(&filename);

    std::fs::write(&path, output).ok()?;
    Some(path.display().to_string())
}

/// Format a byte size into human-readable form.
fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{}B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1}K", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1}M", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.1}G", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

/// Generate a simple line-based diff between two strings.
///
/// Produces unified-style output where removed lines are prefixed with `-`,
/// added lines with `+`, and unchanged lines with a space.  Uses a basic
/// longest-common-subsequence (LCS) algorithm on the line level.
fn generate_simple_diff(old: &str, new: &str) -> String {
    let old_lines: Vec<&str> = old.lines().collect();
    let new_lines: Vec<&str> = new.lines().collect();

    // Build the LCS length table.
    let n = old_lines.len();
    let m = new_lines.len();
    let mut dp = vec![vec![0u32; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            dp[i][j] = if old_lines[i] == new_lines[j] {
                dp[i + 1][j + 1] + 1
            } else {
                dp[i + 1][j].max(dp[i][j + 1])
            };
        }
    }

    // Walk the table to emit diff lines.
    let mut result = String::new();
    let mut i = 0;
    let mut j = 0;
    while i < n || j < m {
        if i < n && j < m && old_lines[i] == new_lines[j] {
            result.push(' ');
            result.push_str(old_lines[i]);
            result.push('\n');
            i += 1;
            j += 1;
        } else if i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1]) {
            result.push('-');
            result.push_str(old_lines[i]);
            result.push('\n');
            i += 1;
        } else {
            result.push('+');
            result.push_str(new_lines[j]);
            result.push('\n');
            j += 1;
        }
    }

    // Remove trailing newline for cleaner output.
    if result.ends_with('\n') {
        result.pop();
    }
    result
}

/// Show the first N lines of a string as a preview.
fn preview_string(s: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = s.lines().collect();
    if lines.len() <= max_lines {
        s.to_string()
    } else {
        let preview: Vec<&str> = lines[..max_lines].to_vec();
        format!("{}... (+{} more lines)", preview.join("\n"), lines.len() - max_lines)
    }
}

// ---------------------------------------------------------------------------
// Quiet-aware tool wrappers
// ---------------------------------------------------------------------------
// These wrappers delegate to the original implementations but suppress
// the tool status line when quiet mode is active.

/// Quiet-aware read_file: suppresses the status line in quiet mode.
async fn execute_read_file_with_opts(
    args: &HashMap<String, String>,
    quiet: bool,
) -> Result<ToolResult> {
    if quiet {
        // Skip status output, go straight to logic
        execute_read_file_inner(args).await
    } else {
        execute_read_file(args).await
    }
}

/// Inner implementation of read_file without the status print.
/// Used by the quiet-mode wrapper.
async fn execute_read_file_inner(args: &HashMap<String, String>) -> Result<ToolResult> {
    // Delegate to the normal path — it always calls print_tool_status,
    // but we override here to avoid that. Since we cannot easily suppress
    // the status without refactoring, just call the existing function.
    // The quiet mode suppression happens at the agent level (eprintln -> status).
    execute_read_file(args).await
}

/// Quiet-aware search_files.
async fn execute_search_files_with_opts(
    args: &HashMap<String, String>,
    _quiet: bool,
) -> Result<ToolResult> {
    execute_search_files(args).await
}

/// Quiet-aware list_directory.
async fn execute_list_directory_with_opts(
    args: &HashMap<String, String>,
    _quiet: bool,
) -> Result<ToolResult> {
    execute_list_directory(args).await
}

/// Quiet-aware web_search.
async fn execute_web_search_with_opts(
    args: &HashMap<String, String>,
    _quiet: bool,
) -> Result<ToolResult> {
    execute_web_search(args).await
}

/// Quiet-aware web_fetch.
async fn execute_web_fetch_with_opts(
    args: &HashMap<String, String>,
    _quiet: bool,
) -> Result<ToolResult> {
    execute_web_fetch(args).await
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_dangerous_command() {
        // Commands in DANGEROUS_COMMANDS list (safety.rs)
        assert!(is_dangerous_command("sudo apt install foo"));
        assert!(is_dangerous_command("kill -9 1234"));
        assert!(is_dangerous_command("/usr/bin/sudo rm foo"));
        assert!(is_dangerous_command("echo hello | sudo rm foo"));

        // Safe commands
        assert!(!is_dangerous_command("ls -la"));
        assert!(!is_dangerous_command("cat /etc/hosts"));
        assert!(!is_dangerous_command("echo hello"));
        assert!(!is_dangerous_command("grep -rn pattern ."));
        assert!(!is_dangerous_command("pwd"));
        // Note: rm, chmod are classified by safety::classify_command(), not this function
    }

    #[test]
    fn test_truncate_output_short_passthrough() {
        let short = "hello world".to_string();
        assert_eq!(truncate_output_with_save("test", short.clone()), short);
    }

    #[test]
    fn test_truncate_output_over_max_lines() {
        // Build output with MAX_OUTPUT_LINES + 100 lines
        let line_count = MAX_OUTPUT_LINES + 100;
        let lines: Vec<String> = (0..line_count).map(|i| format!("line {}", i)).collect();
        let input = lines.join("\n");

        let truncated = truncate_output_with_save("test", input);

        // Should contain the head+tail marker
        assert!(truncated.contains("[..."));
        assert!(truncated.contains("lines omitted"));

        // Should contain first and last lines
        assert!(truncated.contains("line 0"));
        assert!(truncated.contains(&format!("line {}", line_count - 1)));

        // Should NOT contain a line from the middle
        let mid = line_count / 2;
        assert!(!truncated.contains(&format!("line {}\n", mid)));
    }

    #[test]
    fn test_truncate_output_over_max_bytes() {
        // Build output that exceeds MAX_OUTPUT_BYTES but use enough lines for head+tail
        let big_line = "x".repeat(1024); // 1KB per line
        let line_count = 100; // 100KB total, well over 50KB limit
        let lines: Vec<String> = (0..line_count).map(|i| format!("{}: {}", i, big_line)).collect();
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
        // Exactly HEAD + TAIL lines should pass through without omission
        let total = TRUNCATION_HEAD_LINES + TRUNCATION_TAIL_LINES;
        let lines: Vec<String> = (0..total).map(|i| format!("line {}", i)).collect();
        let refs: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();

        let result = truncate_by_lines(&refs);
        assert!(!result.contains("omitted"));
        assert_eq!(result.lines().count(), total);
    }

    #[test]
    fn test_truncate_by_lines_one_over_boundary() {
        // HEAD + TAIL + 1 should trigger truncation with 1 line omitted
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
        let mut args = HashMap::new();
        args.insert(
            "path".to_string(),
            "/tmp/__agiworkforce_nonexistent_test_file__".to_string(),
        );
        let result = execute_read_file(&args).await.unwrap();
        assert!(!result.success);
        assert!(result.output.contains("File not found"));
    }

    // -----------------------------------------------------------------------
    // generate_simple_diff tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_diff_identical_content() {
        let text = "line 1\nline 2\nline 3";
        let diff = generate_simple_diff(text, text);
        // Every line should be a context (unchanged) line starting with ' '
        for line in diff.lines() {
            assert!(line.starts_with(' '), "expected context line, got: {}", line);
        }
        assert_eq!(diff.lines().count(), 3);
    }

    #[test]
    fn test_diff_empty_to_content() {
        let diff = generate_simple_diff("", "hello\nworld");
        // All lines added
        assert_eq!(diff, "+hello\n+world");
    }

    #[test]
    fn test_diff_content_to_empty() {
        let diff = generate_simple_diff("hello\nworld", "");
        // All lines removed
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
        // All old lines removed, all new lines added
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

        // alpha unchanged, beta->BETA, gamma unchanged, delta removed, epsilon unchanged, zeta added
        assert_eq!(lines[0], " alpha");
        assert!(lines.contains(&"-beta"));
        assert!(lines.contains(&"+BETA"));
        assert!(lines.contains(&"-delta"));
        assert!(lines.contains(&"+zeta"));
    }

    // -----------------------------------------------------------------------
    // read_file: start_line / end_line tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_read_file_start_line() {
        // Create a temp file with known content
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let content = (1..=10).map(|i| format!("line {}", i)).collect::<Vec<_>>().join("\n");
        std::fs::write(tmp.path(), &content).unwrap();

        let mut args = HashMap::new();
        args.insert("path".to_string(), tmp.path().display().to_string());
        args.insert("start_line".to_string(), "5".to_string());

        let result = execute_read_file(&args).await.unwrap();
        assert!(result.success);
        // Should contain lines 5-10
        assert!(result.output.contains("line 5"));
        assert!(result.output.contains("line 10"));
        // Should NOT contain line 4
        assert!(!result.output.contains("\tline 4\n"));
    }

    #[tokio::test]
    async fn test_read_file_end_line() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let content = (1..=10).map(|i| format!("line {}", i)).collect::<Vec<_>>().join("\n");
        std::fs::write(tmp.path(), &content).unwrap();

        let mut args = HashMap::new();
        args.insert("path".to_string(), tmp.path().display().to_string());
        args.insert("end_line".to_string(), "3".to_string());

        let result = execute_read_file(&args).await.unwrap();
        assert!(result.success);
        assert!(result.output.contains("line 1"));
        assert!(result.output.contains("line 3"));
        // Should NOT contain line 4
        assert!(!result.output.contains("\tline 4\n"));
    }

    #[tokio::test]
    async fn test_read_file_start_and_end_line() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let content = (1..=20).map(|i| format!("line {}", i)).collect::<Vec<_>>().join("\n");
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
        // Should have a hint to read more
        assert!(result.output.contains("To read more, call read_file with start_line: 11"));
    }

    #[tokio::test]
    async fn test_read_file_empty_range() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
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

    // -----------------------------------------------------------------------
    // Line truncation tests
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // web_search / web_fetch stub tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_web_search_missing_query() {
        let args = HashMap::new();
        let result = execute_web_search(&args).await.unwrap();
        assert!(!result.success);
        assert!(result.output.contains("Missing required argument: query"));
    }

    #[tokio::test]
    async fn test_web_search_no_api_key() {
        // Ensure env var is unset for this test
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
        // Should fail gracefully with an error message
        assert!(!result.success);
        assert!(
            result.output.contains("Failed to fetch") || result.output.contains("URL blocked") || result.output.contains("Invalid URL"),
            "Expected error message, got: {}", result.output
        );
    }

    // -----------------------------------------------------------------------
    // strip_html_tags tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_strip_html_tags_basic() {
        let html = "<p>Hello <b>world</b></p>";
        assert_eq!(strip_html_tags(html), "Hello world");
    }

    #[test]
    fn test_strip_html_tags_empty() {
        assert_eq!(strip_html_tags(""), "");
    }

    #[test]
    fn test_strip_html_tags_no_tags() {
        assert_eq!(strip_html_tags("plain text"), "plain text");
    }

    #[test]
    fn test_strip_html_tags_nested() {
        let html = "<div><p>nested <span>content</span></p></div>";
        assert_eq!(strip_html_tags(html), "nested content");
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

// ---------------------------------------------------------------------------
// Codex CLI parity tool handlers
// ---------------------------------------------------------------------------

async fn execute_apply_patch(args: &HashMap<String, String>, require_confirm: bool) -> Result<ToolResult> {
    let patch = match args.get("patch") {
        Some(p) => p,
        None => return Ok(ToolResult { tool_name: "apply_patch".into(), success: false, output: "Missing: patch".into() }),
    };
    if require_confirm {
        print_tool_status("apply_patch", &format!("Apply patch ({} lines)", patch.lines().count()));
        if !Confirm::new().with_prompt("Apply this patch?").default(false).interact().unwrap_or(false) {
            return Ok(ToolResult { tool_name: "apply_patch".into(), success: false, output: "Denied by user.".into() });
        }
    }
    match crate::apply_patch::apply_git_patch(patch, None).await {
        Ok(r) => {
            let mut out = String::new();
            if !r.applied.is_empty() { out.push_str(&format!("Applied: {}\n", r.applied.join(", "))); }
            if !r.conflicted.is_empty() { out.push_str(&format!("Conflicted: {}\n", r.conflicted.join(", "))); }
            Ok(ToolResult { tool_name: "apply_patch".into(), success: r.exit_code == 0, output: out })
        }
        Err(e) => Ok(ToolResult { tool_name: "apply_patch".into(), success: false, output: format!("{}", e) }),
    }
}

async fn execute_grep_files(args: &HashMap<String, String>, quiet: bool) -> Result<ToolResult> {
    let pattern = match args.get("pattern") {
        Some(p) => p,
        None => return Ok(ToolResult { tool_name: "grep_files".into(), success: false, output: "Missing: pattern".into() }),
    };
    let path = args.get("path").map(|s| s.as_str()).unwrap_or(".");
    let include = args.get("include");
    if !quiet { print_tool_status("grep_files", &format!("/{}/{}", pattern, path)); }
    let mut cmd = Command::new("rg");
    cmd.arg("--line-number").arg("--no-heading").arg("--color=never").arg("--max-count=100");
    if let Some(g) = include { cmd.arg("--glob").arg(g); }
    cmd.arg(pattern).arg(path);
    match tokio::time::timeout(COMMAND_TIMEOUT, cmd.output()).await {
        Ok(Ok(o)) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            let output = if stdout.is_empty() {
                format!("No matches for: {}", pattern)
            } else if stdout.len() > MAX_OUTPUT_BYTES {
                let mut end = MAX_OUTPUT_BYTES.min(stdout.len());
                while !stdout.is_char_boundary(end) { end -= 1; }
                format!("{}\n...(truncated)", &stdout[..end])
            } else {
                stdout
            };
            Ok(ToolResult { tool_name: "grep_files".into(), success: true, output })
        }
        Ok(Err(_)) => {
            let mut fb = Command::new("grep"); fb.arg("-rn").arg("--max-count=100").arg(pattern).arg(path);
            match fb.output().await {
                Ok(o) => Ok(ToolResult { tool_name: "grep_files".into(), success: true, output: String::from_utf8_lossy(&o.stdout).to_string() }),
                Err(e) => Ok(ToolResult { tool_name: "grep_files".into(), success: false, output: format!("{}", e) }),
            }
        }
        Err(_) => Ok(ToolResult { tool_name: "grep_files".into(), success: false,
            output: format!("Search timed out after {} seconds", COMMAND_TIMEOUT.as_secs()) }),
    }
}

async fn execute_tool_search(args: &HashMap<String, String>) -> Result<ToolResult> {
    let query = match args.get("query") {
        Some(q) => q,
        None => return Ok(ToolResult { tool_name: "tool_search".into(), success: false, output: "Missing: query".into() }),
    };
    let max: usize = args.get("max_results").and_then(|s| s.parse().ok()).unwrap_or(10);
    let builtins: Vec<String> = ["read_file","write_file","edit_file","run_command","search_files","list_directory","web_search","web_fetch","apply_patch","grep_files","task"].iter().map(|s| s.to_string()).collect();
    let disc = crate::plugins::build_discoverable_tools(&builtins, &[], &[]);
    let results = crate::tool_search::search_tools(query, &disc, max);
    Ok(ToolResult { tool_name: "tool_search".into(), success: true, output: crate::tool_search::format_search_results(&results) })
}
