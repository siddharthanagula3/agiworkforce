use serde::Deserialize;
use std::collections::HashMap;

use anyhow::Result;
use colored::Colorize;
use dialoguer::Confirm;

use super::common::{
    generate_simple_diff, preview_string, print_tool_status, truncate_line,
    truncate_output_with_save, validate_file_path, MAX_FILE_LINES,
};
use super::ToolResult;

#[derive(Debug, Deserialize)]
struct MultiEditOp {
    old_string: String,
    new_string: String,
    #[serde(default)]
    replace_all: bool,
}

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

    // Detect image files before attempting to read as text — binary reads would
    // return garbled data.  Return an actionable message instead.
    let extension = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    let is_image = matches!(
        extension.as_deref(),
        Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "tiff" | "tif" | "svg")
    );
    if is_image {
        return Ok(ToolResult {
            tool_name: "read_file".to_string(),
            success: false,
            output: format!(
                "Image file detected: {}\n\
                 Image files cannot be read as text. \
                 To include an image in the conversation, use the `--file / -f` flag when \
                 starting the CLI (e.g. `agi -f {} \"describe this image\"`).",
                path, path
            ),
        });
    }

    match tokio::fs::read_to_string(file_path).await {
        Ok(contents) => {
            crate::file_state::record_file_read(file_path, &contents);

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

    let validated_path = match validate_file_path(path) {
        Ok(p) => p,
        Err(reason) => {
            return Ok(ToolResult {
                tool_name: "write_file".to_string(),
                success: false,
                output: format!("Path rejected: {}", reason),
            });
        }
    };

    print_tool_status("write_file", &format!("Write({})", path));

    let file_path = validated_path.as_path();
    if let Err(message) = crate::file_state::ensure_previously_read_and_fresh(file_path) {
        return Ok(ToolResult {
            tool_name: "write_file".to_string(),
            success: false,
            output: message,
        });
    }

    if require_confirmation {
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
            crate::file_state::record_file_write(file_path, content);
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

    let validated_path = match validate_file_path(path) {
        Ok(p) => p,
        Err(reason) => {
            return Ok(ToolResult {
                tool_name: "edit_file".to_string(),
                success: false,
                output: format!("Path rejected: {}", reason),
            });
        }
    };

    print_tool_status("edit_file", &format!("Edit({})", path));

    let file_path = validated_path.as_path();
    if !file_path.exists() {
        return Ok(ToolResult {
            tool_name: "edit_file".to_string(),
            success: false,
            output: format!("File not found: {}", path),
        });
    }
    if let Err(message) = crate::file_state::ensure_previously_read_and_fresh(file_path) {
        return Ok(ToolResult {
            tool_name: "edit_file".to_string(),
            success: false,
            output: message,
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
        Ok(()) => {
            crate::file_state::record_file_write(file_path, &new_contents);
            Ok(ToolResult {
                tool_name: "edit_file".to_string(),
                success: true,
                output: format!("Successfully edited {}", path),
            })
        }
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

    let edits: Vec<MultiEditOp> = serde_json::from_str(edits_json)
        .map_err(|e| anyhow::anyhow!("Invalid edits JSON: {}", e))?;

    print_tool_status(
        "multiedit",
        &format!("MultiEdit({}, {} edits)", path, edits.len()),
    );

    let validated_path = match validate_file_path(&path) {
        Ok(p) => p,
        Err(reason) => {
            return Ok(ToolResult {
                tool_name: "multiedit".into(),
                success: false,
                output: format!("Path rejected: {}", reason),
            });
        }
    };

    let file_path = validated_path.as_path();
    if !file_path.exists() {
        return Ok(ToolResult {
            tool_name: "multiedit".into(),
            success: false,
            output: format!("File not found: {}", path),
        });
    }
    if let Err(message) = crate::file_state::ensure_previously_read_and_fresh(file_path) {
        return Ok(ToolResult {
            tool_name: "multiedit".into(),
            success: false,
            output: message,
        });
    }

    let original = match tokio::fs::read_to_string(file_path).await {
        Ok(c) => c,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "multiedit".into(),
                success: false,
                output: format!("Failed to read file: {}", e),
            });
        }
    };

    let updated = match apply_multiedits_to_content(&original, &edits) {
        Ok(updated) => updated,
        Err(message) => {
            return Ok(ToolResult {
                tool_name: "multiedit".into(),
                success: false,
                output: format!("{message} No edits were applied."),
            });
        }
    };

    if require_confirm {
        let diff = generate_simple_diff(&original, &updated);
        eprintln!(
            "{}",
            format!("  Diff for {} ({} edits):", path, edits.len()).dimmed()
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

        let confirmed = Confirm::new()
            .with_prompt("Allow these edits?")
            .default(true)
            .interact()
            .unwrap_or(false);

        if !confirmed {
            return Ok(ToolResult {
                tool_name: "multiedit".into(),
                success: false,
                output: "User denied multiedit".into(),
            });
        }
    }

    if let Err(e) = tokio::fs::write(file_path, &updated).await {
        return Ok(ToolResult {
            tool_name: "multiedit".into(),
            success: false,
            output: format!("Failed to write file: {}", e),
        });
    }
    crate::file_state::record_file_write(file_path, &updated);

    Ok(ToolResult {
        tool_name: "multiedit".into(),
        success: true,
        output: format!("Applied {}/{} edits to {}", edits.len(), edits.len(), path),
    })
}

fn apply_multiedits_to_content(
    original: &str,
    edits: &[MultiEditOp],
) -> std::result::Result<String, String> {
    let mut updated = original.to_string();

    for (i, edit) in edits.iter().enumerate() {
        if edit.old_string.is_empty() {
            return Err(format!(
                "Edit {} rejected: old_string must not be empty.",
                i + 1
            ));
        }

        let match_count = updated.matches(edit.old_string.as_str()).count();
        if match_count == 0 {
            return Err(format!("Edit {} rejected: old_string not found.", i + 1));
        }
        if match_count > 1 && !edit.replace_all {
            return Err(format!(
                "Edit {} rejected: old_string matched {} times. Set replace_all=true or provide more context.",
                i + 1,
                match_count
            ));
        }

        updated = if edit.replace_all {
            updated.replace(edit.old_string.as_str(), edit.new_string.as_str())
        } else {
            updated.replacen(edit.old_string.as_str(), edit.new_string.as_str(), 1)
        };
    }

    Ok(updated)
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
                crate::file_state::record_file_read(&file_path, &content);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multiedit_applies_all_edits_in_memory_before_write() {
        let edits = vec![
            MultiEditOp {
                old_string: "alpha".into(),
                new_string: "beta".into(),
                replace_all: false,
            },
            MultiEditOp {
                old_string: "gamma".into(),
                new_string: "delta".into(),
                replace_all: false,
            },
        ];

        let updated =
            apply_multiedits_to_content("alpha\ngamma\n", &edits).expect("edits should apply");

        assert_eq!(updated, "beta\ndelta\n");
    }

    #[test]
    fn multiedit_rejects_later_failure_without_partial_result() {
        let edits = vec![
            MultiEditOp {
                old_string: "alpha".into(),
                new_string: "beta".into(),
                replace_all: false,
            },
            MultiEditOp {
                old_string: "missing".into(),
                new_string: "delta".into(),
                replace_all: false,
            },
        ];

        let err = apply_multiedits_to_content("alpha\ngamma\n", &edits)
            .expect_err("second edit should fail");

        assert!(err.contains("Edit 2 rejected"));
    }

    #[test]
    fn multiedit_requires_unique_match_unless_replace_all_is_set() {
        let edits = vec![MultiEditOp {
            old_string: "alpha".into(),
            new_string: "beta".into(),
            replace_all: false,
        }];

        let err = apply_multiedits_to_content("alpha\nalpha\n", &edits)
            .expect_err("duplicate old_string should fail");

        assert!(err.contains("matched 2 times"));
    }

    #[test]
    fn multiedit_supports_replace_all() {
        let edits = vec![MultiEditOp {
            old_string: "alpha".into(),
            new_string: "beta".into(),
            replace_all: true,
        }];

        let updated = apply_multiedits_to_content("alpha\nalpha\n", &edits)
            .expect("replace_all should allow duplicate matches");

        assert_eq!(updated, "beta\nbeta\n");
    }

    #[tokio::test]
    async fn write_file_requires_read_state_for_existing_file() {
        let tmp = tempfile::tempdir_in(".").expect("tempdir");
        let path = tmp.path().join("file.txt");
        std::fs::write(&path, "alpha\n").expect("write file");

        let mut args = HashMap::new();
        args.insert("path".to_string(), path.display().to_string());
        args.insert("content".to_string(), "beta\n".to_string());

        let result = execute_write_file(&args, false).await.unwrap();

        assert!(!result.success);
        assert!(result.output.contains("File has not been read yet"));
    }

    #[tokio::test]
    async fn edit_file_succeeds_after_read_state_is_seeded() {
        let tmp = tempfile::tempdir_in(".").expect("tempdir");
        let path = tmp.path().join("file.txt");
        std::fs::write(&path, "alpha\n").expect("write file");

        let mut read_args = HashMap::new();
        read_args.insert("path".to_string(), path.display().to_string());
        let read_result = execute_read_file(&read_args).await.unwrap();
        assert!(read_result.success);

        let mut edit_args = HashMap::new();
        edit_args.insert("path".to_string(), path.display().to_string());
        edit_args.insert("old_string".to_string(), "alpha".to_string());
        edit_args.insert("new_string".to_string(), "beta".to_string());

        let edit_result = execute_edit_file(&edit_args, false).await.unwrap();

        assert!(edit_result.success, "{}", edit_result.output);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "beta\n");
    }

    #[tokio::test]
    async fn multiedit_requires_read_state_for_existing_file() {
        let tmp = tempfile::tempdir_in(".").expect("tempdir");
        let path = tmp.path().join("file.txt");
        std::fs::write(&path, "alpha\n").expect("write file");

        let mut args = HashMap::new();
        args.insert("path".to_string(), path.display().to_string());
        args.insert(
            "edits".to_string(),
            serde_json::json!([
                {
                    "old_string": "alpha",
                    "new_string": "beta"
                }
            ])
            .to_string(),
        );

        let result = execute_multiedit(&args, false).await.unwrap();

        assert!(!result.success);
        assert!(result.output.contains("File has not been read yet"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "alpha\n");
    }
}
