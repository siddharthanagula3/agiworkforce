use std::collections::HashMap;
use std::path::Path;

use anyhow::Result;
use colored::Colorize;
use dialoguer::Confirm;

use super::common::{
    generate_simple_diff, print_tool_status, preview_string, truncate_line,
    truncate_output_with_save, validate_file_path, MAX_FILE_LINES,
};
use super::ToolResult;

pub(super) async fn execute_read_file(args: &HashMap<String, String>) -> Result<ToolResult> {
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

    let validated_path = match validate_file_path(path) {
        Ok(p) => p,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "read_file".to_string(),
                success: false,
                output: format!("Refusing to read outside project: {}", e),
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

    let file_path = validated_path.as_path();
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

            let start_idx = start_line
                .map(|s| s.saturating_sub(1))
                .unwrap_or(0)
                .min(total_lines);
            let end_idx = end_line.map(|e| e.min(total_lines)).unwrap_or(total_lines);

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

            let capped = range_len > MAX_FILE_LINES;
            let display_count = if capped { MAX_FILE_LINES } else { range_len };

            let mut output = String::new();
            for (i, line) in selected[..display_count].iter().enumerate() {
                let line_no = start_idx + i + 1;
                let display_line = truncate_line(line);
                output.push_str(&format!("{:>6}\t{}\n", line_no, display_line));
            }

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

pub(super) async fn execute_read_file_inner(args: &HashMap<String, String>) -> Result<ToolResult> {
    execute_read_file(args).await
}

pub(super) async fn execute_write_file(
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

    if let Err(reason) = validate_file_path(path) {
        return Ok(ToolResult {
            tool_name: "write_file".to_string(),
            success: false,
            output: format!("Path rejected: {}", reason),
        });
    }

    print_tool_status("write_file", &format!("Write({})", path));

    if require_confirmation {
        let file_path = Path::new(path);
        let line_count = content.lines().count();

        if file_path.exists() && file_path.is_file() {
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

pub(super) async fn execute_edit_file(
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

    if let Err(reason) = validate_file_path(path) {
        return Ok(ToolResult {
            tool_name: "edit_file".to_string(),
            success: false,
            output: format!("Path rejected: {}", reason),
        });
    }

    print_tool_status("edit_file", &format!("Edit({})", path));

    let file_path = Path::new(path);
    if !file_path.exists() {
        return Ok(ToolResult {
            tool_name: "edit_file".to_string(),
            success: false,
            output: format!("File not found: {}", path),
        });
    }

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

pub(super) async fn execute_apply_patch(
    args: &HashMap<String, String>,
    require_confirm: bool,
) -> Result<ToolResult> {
    let patch = match args.get("patch") {
        Some(p) => p,
        None => {
            return Ok(ToolResult {
                tool_name: "apply_patch".into(),
                success: false,
                output: "Missing: patch".into(),
            });
        }
    };
    if require_confirm {
        print_tool_status(
            "apply_patch",
            &format!("Apply patch ({} lines)", patch.lines().count()),
        );
        if !Confirm::new()
            .with_prompt("Apply this patch?")
            .default(false)
            .interact()
            .unwrap_or(false)
        {
            return Ok(ToolResult {
                tool_name: "apply_patch".into(),
                success: false,
                output: "Denied by user.".into(),
            });
        }
    }
    match crate::apply_patch::apply_git_patch(patch, None).await {
        Ok(r) => {
            let mut out = String::new();
            if !r.applied.is_empty() {
                out.push_str(&format!("Applied: {}\n", r.applied.join(", ")));
            }
            if !r.conflicted.is_empty() {
                out.push_str(&format!("Conflicted: {}\n", r.conflicted.join(", ")));
            }
            Ok(ToolResult {
                tool_name: "apply_patch".into(),
                success: r.exit_code == 0,
                output: out,
            })
        }
        Err(e) => Ok(ToolResult {
            tool_name: "apply_patch".into(),
            success: false,
            output: format!("{}", e),
        }),
    }
}

pub(super) async fn execute_multiedit(
    args: &HashMap<String, String>,
    require_confirm: bool,
) -> Result<ToolResult> {
    let path = match args.get("path") {
        Some(p) => p.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "multiedit".into(),
                success: false,
                output: "Missing required argument: path".into(),
            });
        }
    };
    let edits_json = match args.get("edits") {
        Some(e) => e,
        None => {
            return Ok(ToolResult {
                tool_name: "multiedit".into(),
                success: false,
                output: "Missing required argument: edits (JSON array of {old_string, new_string})"
                    .into(),
            });
        }
    };

    let edits: Vec<serde_json::Value> = serde_json::from_str(edits_json)
        .map_err(|e| anyhow::anyhow!("Invalid edits JSON: {}", e))?;

    print_tool_status(
        "multiedit",
        &format!("MultiEdit({}, {} edits)", path, edits.len()),
    );

    let mut applied = 0usize;
    let mut errors = Vec::new();

    for (i, edit) in edits.iter().enumerate() {
        let old_s = edit
            .get("old_string")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let new_s = edit
            .get("new_string")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let replace_all = edit
            .get("replace_all")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let mut edit_args = HashMap::new();
        edit_args.insert("path".to_string(), path.clone());
        edit_args.insert("old_string".to_string(), old_s.to_string());
        edit_args.insert("new_string".to_string(), new_s.to_string());
        if replace_all {
            edit_args.insert("replace_all".to_string(), "true".to_string());
        }

        match execute_edit_file(&edit_args, require_confirm).await {
            Ok(r) if r.success => applied += 1,
            Ok(r) => errors.push(format!("Edit {}: {}", i + 1, r.output)),
            Err(e) => errors.push(format!("Edit {}: {}", i + 1, e)),
        }
    }

    let output = if errors.is_empty() {
        format!("Applied {}/{} edits to {}", applied, edits.len(), path)
    } else {
        format!(
            "Applied {}/{} edits to {}. Errors:\n{}",
            applied,
            edits.len(),
            path,
            errors.join("\n")
        )
    };

    Ok(ToolResult {
        tool_name: "multiedit".into(),
        success: errors.is_empty(),
        output,
    })
}

pub(super) async fn execute_read_many_files(args: &HashMap<String, String>) -> Result<ToolResult> {
    let paths_json = match args.get("paths") {
        Some(p) => p,
        None => {
            return Ok(ToolResult {
                tool_name: "read_many_files".into(),
                success: false,
                output: "Missing required argument: paths (JSON array of file paths)".into(),
            });
        }
    };

    let paths: Vec<String> = serde_json::from_str(paths_json)
        .map_err(|e| anyhow::anyhow!("Invalid paths JSON: {}", e))?;

    if paths.len() > 50 {
        return Ok(ToolResult {
            tool_name: "read_many_files".into(),
            success: false,
            output: format!("Too many files ({}). Maximum is 50.", paths.len()),
        });
    }

    print_tool_status("read_many_files", &format!("Read({} files)", paths.len()));

    let mut output_parts = Vec::new();
    let mut success_count = 0usize;

    for path_str in &paths {
        let file_path = match validate_file_path(path_str) {
            Ok(p) => p,
            Err(e) => {
                output_parts.push(format!(
                    "--- {} ---\n[Refusing to read outside project: {}]",
                    path_str, e
                ));
                continue;
            }
        };
        if !file_path.exists() {
            output_parts.push(format!("--- {} ---\n[File not found]", path_str));
            continue;
        }
        match tokio::fs::read_to_string(&file_path).await {
            Ok(content) => {
                let lines: Vec<&str> = content.lines().take(MAX_FILE_LINES).collect();
                let truncated = if content.lines().count() > MAX_FILE_LINES {
                    format!("\n[... truncated at {} lines]", MAX_FILE_LINES)
                } else {
                    String::new()
                };
                output_parts.push(format!(
                    "--- {} ---\n{}{}",
                    path_str,
                    lines.join("\n"),
                    truncated
                ));
                success_count += 1;
            }
            Err(e) => {
                output_parts.push(format!("--- {} ---\n[Error: {}]", path_str, e));
            }
        }
    }

    Ok(ToolResult {
        tool_name: "read_many_files".into(),
        success: success_count > 0,
        output: truncate_output_with_save(
            "read_many_files",
            format!(
                "Read {}/{} files:\n\n{}",
                success_count,
                paths.len(),
                output_parts.join("\n\n")
            ),
        ),
    })
}
