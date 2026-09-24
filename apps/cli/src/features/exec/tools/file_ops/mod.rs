use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use anyhow::Result;
use colored::Colorize;
use dialoguer::Confirm;
use sha2::{Digest, Sha256};
use tokio::io::AsyncReadExt;

use crate::permissions::FilePermissionOperation;
use crate::terminal_style as ts;
use crate::terminal_text::sanitize_terminal_text;
use crate::tui::approval_broker::{ApprovalDecision, ApprovalRequest, ApprovalRequestKind};

use super::common::{
    display_path, generate_simple_diff, preview_string, print_tool_status, truncate_line,
    truncate_output_with_save, validate_file_path, validate_file_write_path, MAX_FILE_LINES,
};
use super::{approval_allows, request_approval, ApprovalCallback, ToolResult};

const MAX_TEXT_READ_BYTES: u64 = 1_000_000;
const MAX_EDIT_FILE_BYTES: u64 = 2_000_000;

#[derive(Debug, Deserialize)]
struct MultiEditOp {
    old_string: String,
    new_string: String,
    #[serde(default)]
    replace_all: bool,
}

fn saved_file_permission(operation: FilePermissionOperation, paths: &[PathBuf]) -> Option<bool> {
    let perms = crate::permissions::PermissionStore::load().unwrap_or_default();
    perms.check_files(operation, paths)
}

fn persist_file_permission_decision(
    decision: ApprovalDecision,
    operation: FilePermissionOperation,
    paths: &[PathBuf],
) {
    if paths.is_empty() {
        return;
    }

    let mut perms = crate::permissions::PermissionStore::load().unwrap_or_default();
    match decision {
        ApprovalDecision::AllowSession => {
            for path in paths {
                perms.allow_file_session_for_process(operation, path);
            }
        }
        ApprovalDecision::AlwaysAllow => {
            for path in paths {
                perms.allow_file_always(operation, path);
            }
            let _ = perms.save();
        }
        _ => {}
    }
}

fn saved_denial_message(action: &str) -> String {
    format!(
        "{} is denied by saved permissions. Use /permissions reset to clear.",
        action
    )
}

/// Render a diff preview for the terminal.
///.
fn diff_preview_lines(diff: &str) -> Vec<String> {
    diff.lines()
        .map(|line| {
            let line = sanitize_terminal_text(line);
            if let Some(rest) = line.strip_prefix('+') {
                format!("  {}{}", ts::addition("+"), ts::addition(rest))
            } else if let Some(rest) = line.strip_prefix('-') {
                format!("  {}{}", ts::deletion("-"), ts::deletion(rest))
            } else {
                format!("  {}", line.as_ref().dimmed())
            }
        })
        .collect()
}

fn print_diff_preview(diff: &str) {
    for line in diff_preview_lines(diff) {
        eprintln!("{line}");
    }
}

/// Reached when a mutating tool needs approval, there is no TUI/approval
/// callback installed (headless / `agi exec` context), and stdin is not a.
fn abort_noninteractive_auto_deny(tool_name: &str, action: &str) -> ! {
    eprintln!(
        "{}",
        ts::danger(format!(
            "{action} requires approval, but no --full-auto/-y/--dangerously-skip-permissions \
             flag was passed and stdin is not a terminal, so no confirmation is possible."
        ))
    );
    eprintln!(
        "{}",
        format!(
            "  Refusing to silently continue: exiting with a non-zero status instead of letting \
             the '{tool_name}' call be auto-denied without signal.",
        )
        .dimmed()
    );
    crate::agent_events::emit_terminal_error(
        "approval_required",
        format!("{action} requires approval and no confirmation is possible here."),
        "Pass --full-auto, -y or --dangerously-skip-permissions, or run where stdin is a terminal.",
    );
    std::process::exit(1);
}

/// True when there is no way to prompt a human for approval right now:
/// stdin is not attached to a terminal (e.g. `agi exec ... </dev/null`, a.
fn stdin_is_noninteractive() -> bool {
    !crate::interactive::can_prompt()
}

async fn read_text_file_limited(
    file_path: &std::path::Path,
    max_bytes: u64,
) -> std::io::Result<(String, bool)> {
    let metadata = tokio::fs::metadata(file_path).await?;
    if metadata.len() <= max_bytes {
        return tokio::fs::read_to_string(file_path)
            .await
            .map(|content| (content, false));
    }

    let file = tokio::fs::File::open(file_path).await?;
    let mut buffer = Vec::with_capacity(max_bytes as usize);
    let mut limited = file.take(max_bytes);
    limited.read_to_end(&mut buffer).await?;
    Ok((String::from_utf8_lossy(&buffer).to_string(), true))
}

async fn read_editable_text_file(
    file_path: &std::path::Path,
) -> std::result::Result<String, String> {
    let metadata = tokio::fs::metadata(file_path)
        .await
        .map_err(|e| format!("Failed to inspect file: {e}"))?;
    if metadata.len() > MAX_EDIT_FILE_BYTES {
        return Err(format!(
            "File is too large to edit safely ({} bytes; limit {} bytes). Use a narrower patch or split the file first.",
            metadata.len(),
            MAX_EDIT_FILE_BYTES
        ));
    }
    tokio::fs::read_to_string(file_path)
        .await
        .map_err(|e| format!("Failed to read file: {e}"))
}

fn read_existing_text_for_preview(
    file_path: &std::path::Path,
) -> std::result::Result<String, String> {
    let metadata = std::fs::metadata(file_path)
        .map_err(|e| format!("Failed to inspect existing file: {e}"))?;
    if metadata.len() > MAX_EDIT_FILE_BYTES {
        return Err(format!(
            "Existing file is too large to preview safely ({} bytes; limit {} bytes).",
            metadata.len(),
            MAX_EDIT_FILE_BYTES
        ));
    }
    std::fs::read_to_string(file_path).map_err(|e| format!("Failed to read existing file: {e}"))
}

fn normalize_patch_target(raw: &str) -> Option<String> {
    let trimmed = raw.split('\t').next().unwrap_or(raw).trim();
    if trimmed.is_empty() || trimmed == "/dev/null" {
        return None;
    }
    let stripped = trimmed
        .strip_prefix("a/")
        .or_else(|| trimmed.strip_prefix("b/"))
        .unwrap_or(trimmed);
    Some(stripped.to_string())
}

fn patch_target_paths(patch: &str) -> std::result::Result<Vec<PathBuf>, String> {
    let mut seen = HashSet::new();
    let mut paths = Vec::new();

    for line in patch.lines() {
        let mut candidates = Vec::new();
        if let Some(rest) = line.strip_prefix("--- ") {
            candidates.push(rest);
        } else if let Some(rest) = line.strip_prefix("+++ ") {
            candidates.push(rest);
        } else if let Some(rest) = line.strip_prefix("diff --git ") {
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if parts.len() >= 2 {
                candidates.push(parts[0]);
                candidates.push(parts[1]);
            }
        }

        for candidate in candidates {
            let Some(target) = normalize_patch_target(candidate) else {
                continue;
            };
            if !seen.insert(target.clone()) {
                continue;
            }
            let path = validate_file_write_path(&target)
                .map_err(|reason| format!("Patch target rejected: {}", reason))?;
            paths.push(path);
        }
    }

    Ok(paths)
}

fn patch_permission_paths(patch: &str) -> std::result::Result<Vec<PathBuf>, String> {
    let paths = patch_target_paths(patch)?;
    if paths.is_empty() {
        let digest = Sha256::digest(patch.as_bytes());
        let hex = digest
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        Ok(vec![PathBuf::from(format!("patch-sha256:{hex}"))])
    } else {
        Ok(paths)
    }
}

/// Below this many lines a file is cheap to rewrite whole.
const REWRITE_GUARD_MIN_LINES: usize = 40;
/// Above this many changed lines a rewrite is a rewrite, not a targeted fix.
const REWRITE_GUARD_MAX_CHANGED_LINES: usize = 5;

/// How many lines differ, as a multiset so the cost is linear. A lower bound
/// by construction: it can let a rewrite through, never block a real one.
fn changed_line_count(old: &str, new: &str) -> usize {
    let mut counts: std::collections::HashMap<&str, i64> = std::collections::HashMap::new();
    for line in old.lines() {
        *counts.entry(line).or_default() += 1;
    }
    for line in new.lines() {
        *counts.entry(line).or_default() -= 1;
    }
    counts
        .values()
        .map(|delta| delta.unsigned_abs() as usize)
        .sum()
}

/// `Some(message)` when this write rewrites a whole file to carry a change
/// `edit_file` would express. A rewrite discards concurrent edits to the rest.
fn rewrite_guard_refusal(shown_path: &str, old: &str, new: &str) -> Option<String> {
    let old_lines = old.lines().count();
    if old_lines < REWRITE_GUARD_MIN_LINES || old == new {
        return None;
    }
    let changed = changed_line_count(old, new);
    if changed == 0 || changed > REWRITE_GUARD_MAX_CHANGED_LINES || changed * 10 > old_lines {
        return None;
    }
    Some(format!(
        "Refusing to rewrite {shown_path}: this write replaces all {old_lines} lines but only \
         {changed} differ. Use edit_file (or multiedit for several sites) so the rest of the file \
         is left untouched."
    ))
}

const CONFLICT_INLINE_MAX_LINES: usize = 40;

/// The base/ours/theirs view of a conflicted file, appended to its raw read so
/// the three sides are readable without re-deriving them from the markers.
fn conflict_view(file_path: &Path, contents: &str) -> Option<String> {
    if !crate::merge_conflicts::has_conflict_markers(contents) {
        return None;
    }
    let relative = crate::path_security::repo_relative(file_path);
    let file = crate::merge_conflicts::parse_conflicts(&relative, contents);
    if !file.is_conflicted() {
        return None;
    }

    let mut view = format!(
        "\n\n[merge conflict: {} hunk(s) in {}]\n\
         Every hunk needs an explicit resolution; nothing here picks a side for you.\n",
        file.hunks.len(),
        relative.display()
    );
    for line in file.outline() {
        view.push_str(&format!("  {line}\n"));
    }
    for hunk in &file.hunks {
        let sides = [
            (
                crate::merge_conflicts::ConflictSide::Base,
                hunk.base.as_deref(),
            ),
            (
                crate::merge_conflicts::ConflictSide::Ours,
                Some(hunk.ours.as_slice()),
            ),
            (
                crate::merge_conflicts::ConflictSide::Theirs,
                Some(hunk.theirs.as_slice()),
            ),
        ];
        for (side, lines) in sides {
            let Some(lines) = lines else {
                view.push_str(&format!("  hunk {} {side}: not recorded\n", hunk.index));
                continue;
            };
            if lines.len() > CONFLICT_INLINE_MAX_LINES {
                view.push_str(&format!(
                    "  hunk {} {side}: {} lines (too long to inline)\n",
                    hunk.index,
                    lines.len()
                ));
                continue;
            }
            view.push_str(&format!("  hunk {} {side}:\n", hunk.index));
            for line in lines {
                view.push_str(&format!("    {}\n", truncate_line(line)));
            }
        }
    }
    Some(view)
}

/// `Some(message)` when a write would put conflict markers into a file that had
/// none. Writing markers is how an unresolved merge gets committed as content.
fn conflict_marker_refusal(shown_path: &str, old: &str, new: &str) -> Option<String> {
    if !crate::merge_conflicts::has_conflict_markers(new)
        || crate::merge_conflicts::has_conflict_markers(old)
    {
        return None;
    }
    Some(format!(
        "Refusing to write {shown_path}: the content introduces merge conflict markers. \
         Resolve the conflict and write the resolved text."
    ))
}

/// The refusal for a path that is not there, kept distinct from a read failure
/// and named against the repository root so a retry uses the real spelling.
fn missing_path_message(path: &Path) -> String {
    let shown = crate::path_security::repo_relative(path);
    let suggestions = crate::path_security::nearest_existing_paths(path, 3);
    if suggestions.is_empty() {
        return format!(
            "Path does not exist: {}. Nothing in this repository matches it; \
             locate the file with glob or search_files before reading it.",
            shown.display()
        );
    }
    let named: Vec<String> = suggestions
        .iter()
        .map(|candidate| {
            crate::path_security::repo_relative(candidate)
                .display()
                .to_string()
        })
        .collect();
    format!(
        "Path does not exist: {}. Did you mean: {}?",
        shown.display(),
        named.join(", ")
    )
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

    if crate::sensitive_files::is_sensitive_file(path) {
        return Ok(ToolResult {
            tool_name: "read_file".to_string(),
            success: false,
            output: crate::sensitive_files::sensitive_refusal(path),
        });
    }

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
            output: missing_path_message(file_path),
        });
    }

    if !file_path.is_file() {
        return Ok(ToolResult {
            tool_name: "read_file".to_string(),
            success: false,
            output: format!(
                "Not a file: {} (it is a directory; use list_directory or glob)",
                crate::path_security::repo_relative(file_path).display()
            ),
        });
    }

    // Detect image files before attempting to read as text, binary reads would
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

    match read_text_file_limited(file_path, MAX_TEXT_READ_BYTES).await {
        Ok((contents, byte_truncated)) => {
            if !byte_truncated {
                crate::file_state::record_file_read(file_path, &contents);
            }

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
            if byte_truncated {
                output.push_str(&format!(
                    "\n[truncated: read first {} bytes; file was not marked fully read for editing]",
                    MAX_TEXT_READ_BYTES
                ));
            }

            let mut output = truncate_output_with_save("read_file", output);
            if let Some(view) = conflict_view(file_path, &contents) {
                output.push_str(&view);
            }

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
    approval_callback: Option<&ApprovalCallback>,
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

    let validated_path = match validate_file_write_path(path) {
        Ok(p) => p,
        Err(reason) => {
            return Ok(ToolResult {
                tool_name: "write_file".to_string(),
                success: false,
                output: format!("Path rejected: {}", reason),
            });
        }
    };

    let file_path = validated_path.as_path();
    let shown_path = display_path(file_path);
    print_tool_status("write_file", &format!("Write({})", shown_path));

    if let Err(message) = crate::file_state::ensure_previously_read_and_fresh(file_path) {
        return Ok(ToolResult {
            tool_name: "write_file".to_string(),
            success: false,
            output: message,
        });
    }

    let existing = file_path
        .is_file()
        .then(|| read_existing_text_for_preview(file_path).ok())
        .flatten();
    if let Some(refusal) =
        conflict_marker_refusal(&shown_path, existing.as_deref().unwrap_or(""), content).or_else(
            || {
                existing
                    .as_deref()
                    .and_then(|existing| rewrite_guard_refusal(&shown_path, existing, content))
            },
        )
    {
        return Ok(ToolResult {
            tool_name: "write_file".to_string(),
            success: false,
            output: refusal,
        });
    }

    if require_confirmation {
        let line_count = content.lines().count();
        let permission_paths = vec![file_path.to_path_buf()];

        match saved_file_permission(FilePermissionOperation::Write, &permission_paths) {
            Some(true) => {}
            Some(false) => {
                return Ok(ToolResult {
                    tool_name: "write_file".to_string(),
                    success: false,
                    output: saved_denial_message("File write"),
                });
            }
            None => {
                if let Some(decision) = request_approval(
                    approval_callback,
                    ApprovalRequest::new(
                        ApprovalRequestKind::FileWrite {
                            path: file_path.to_path_buf(),
                        },
                        "Allow this file write?",
                        file_write_detail(&shown_path, content, file_path, line_count),
                    ),
                )
                .await
                {
                    // Resolved by the TUI approval overlay (or any installed callback).
                    // This decision is authoritative, do NOT fall through to the.
                    if !approval_allows(decision) {
                        return Ok(ToolResult {
                            tool_name: "write_file".to_string(),
                            success: false,
                            output: "User denied file write".to_string(),
                        });
                    }
                    persist_file_permission_decision(
                        decision,
                        FilePermissionOperation::Write,
                        &permission_paths,
                    );
                } else {
                    // No TUI callback (REPL / headless): preview the change, then fall
                    // back to the blocking dialoguer confirm.
                    if stdin_is_noninteractive() {
                        abort_noninteractive_auto_deny("write_file", "Writing this file");
                    }
                    if file_path.exists() && file_path.is_file() {
                        match read_existing_text_for_preview(file_path) {
                            Ok(existing) => {
                                let diff = generate_simple_diff(&existing, content);
                                eprintln!(
                                    "{}",
                                    format!(
                                        "  Diff for {} ({} lines):",
                                        sanitize_terminal_text(path),
                                        line_count
                                    )
                                    .dimmed()
                                );
                                print_diff_preview(&diff);
                            }
                            Err(message) => {
                                eprintln!(
                                    "{}",
                                    format!(
                                        "  {message}\n  Will write {} lines to {}",
                                        line_count,
                                        sanitize_terminal_text(path)
                                    )
                                    .dimmed()
                                );
                            }
                        }
                    } else {
                        eprintln!(
                            "{}",
                            format!(
                                "  [new file] {} ({} lines)",
                                sanitize_terminal_text(path),
                                line_count
                            )
                            .dimmed()
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
            }
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

fn file_write_detail(
    display_path: &str,
    content: &str,
    file_path: &std::path::Path,
    line_count: usize,
) -> Vec<String> {
    if file_path.exists() && file_path.is_file() {
        match read_existing_text_for_preview(file_path) {
            Ok(existing) => {
                let mut detail = vec![format!("Diff for {} ({} lines):", display_path, line_count)];
                detail.extend(
                    generate_simple_diff(&existing, content)
                        .lines()
                        .take(40)
                        .map(str::to_string),
                );
                return detail;
            }
            Err(message) => {
                return vec![
                    message,
                    format!("Will write {} lines to {}", line_count, display_path),
                ];
            }
        }
    }

    vec![format!(
        "[new file] {} ({} lines)",
        display_path, line_count
    )]
}

pub(super) async fn execute_edit_file(
    args: &HashMap<String, String>,
    require_confirmation: bool,
    approval_callback: Option<&ApprovalCallback>,
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

    let validated_path = match validate_file_write_path(path) {
        Ok(p) => p,
        Err(reason) => {
            return Ok(ToolResult {
                tool_name: "edit_file".to_string(),
                success: false,
                output: format!("Path rejected: {}", reason),
            });
        }
    };

    print_tool_status(
        "edit_file",
        &format!("Edit({})", display_path(&validated_path)),
    );

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

    let contents = match read_editable_text_file(file_path).await {
        Ok(c) => c,
        Err(message) => {
            return Ok(ToolResult {
                tool_name: "edit_file".to_string(),
                success: false,
                output: message,
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
        let permission_paths = vec![file_path.to_path_buf()];

        match saved_file_permission(FilePermissionOperation::Edit, &permission_paths) {
            Some(true) => {}
            Some(false) => {
                return Ok(ToolResult {
                    tool_name: "edit_file".to_string(),
                    success: false,
                    output: saved_denial_message("File edit"),
                });
            }
            None => {
                if let Some(decision) = request_approval(
                    approval_callback,
                    ApprovalRequest::new(
                        ApprovalRequestKind::FileEdit {
                            path: file_path.to_path_buf(),
                        },
                        "Allow this edit?",
                        vec![format!("- {}", old_preview), format!("+ {}", new_preview)],
                    ),
                )
                .await
                {
                    if !approval_allows(decision) {
                        return Ok(ToolResult {
                            tool_name: "edit_file".to_string(),
                            success: false,
                            output: "User denied edit".to_string(),
                        });
                    }
                    persist_file_permission_decision(
                        decision,
                        FilePermissionOperation::Edit,
                        &permission_paths,
                    );
                } else {
                    if stdin_is_noninteractive() {
                        abort_noninteractive_auto_deny("edit_file", "Editing this file");
                    }
                    eprintln!(
                        "  {} {}",
                        ts::deletion("-"),
                        ts::deletion(sanitize_terminal_text(&old_preview))
                    );
                    eprintln!(
                        "  {} {}",
                        ts::addition("+"),
                        ts::addition(sanitize_terminal_text(&new_preview))
                    );

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
            }
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
    approval_callback: Option<&ApprovalCallback>,
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
        let patch_paths = match patch_target_paths(patch) {
            Ok(paths) => paths,
            Err(message) => {
                return Ok(ToolResult {
                    tool_name: "apply_patch".into(),
                    success: false,
                    output: message,
                });
            }
        };
        let permission_paths =
            patch_permission_paths(patch).unwrap_or_else(|_| patch_paths.clone());
        print_tool_status(
            "apply_patch",
            &format!("Apply patch ({} lines)", patch.lines().count()),
        );
        let allowed = match saved_file_permission(FilePermissionOperation::Patch, &permission_paths)
        {
            Some(true) => true,
            Some(false) => {
                return Ok(ToolResult {
                    tool_name: "apply_patch".into(),
                    success: false,
                    output: saved_denial_message("Patch"),
                });
            }
            None => {
                if let Some(decision) = request_approval(
                    approval_callback,
                    ApprovalRequest::new(
                        ApprovalRequestKind::Patch {
                            files: patch_paths.clone(),
                        },
                        "Apply this patch?",
                        patch.lines().take(40).map(str::to_string).collect(),
                    ),
                )
                .await
                {
                    if approval_allows(decision) {
                        persist_file_permission_decision(
                            decision,
                            FilePermissionOperation::Patch,
                            &permission_paths,
                        );
                        true
                    } else {
                        false
                    }
                } else {
                    if stdin_is_noninteractive() {
                        abort_noninteractive_auto_deny("apply_patch", "Applying this patch");
                    }
                    Confirm::new()
                        .with_prompt("Apply this patch?")
                        .default(false)
                        .interact()
                        .unwrap_or(false)
                }
            }
        };

        if !allowed {
            return Ok(ToolResult {
                tool_name: "apply_patch".into(),
                success: false,
                output: "Denied by user.".into(),
            });
        }
    }
    // Freshness gate: for every existing file the patch will touch, confirm
    // it has been read since it was last modified on disk.  This matches the.
    if let Ok(paths) = patch_target_paths(patch) {
        for path in &paths {
            if path.exists() {
                if let Err(msg) = crate::file_state::ensure_previously_read_and_fresh(path) {
                    return Ok(ToolResult {
                        tool_name: "apply_patch".into(),
                        success: false,
                        output: format!("apply_patch blocked: {} ({})", path.display(), msg),
                    });
                }
            }
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
    approval_callback: Option<&ApprovalCallback>,
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

    let validated_path = match validate_file_write_path(&path) {
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

    let original = match read_editable_text_file(file_path).await {
        Ok(c) => c,
        Err(message) => {
            return Ok(ToolResult {
                tool_name: "multiedit".into(),
                success: false,
                output: message,
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
        let permission_paths = vec![file_path.to_path_buf()];

        match saved_file_permission(FilePermissionOperation::MultiEdit, &permission_paths) {
            Some(true) => {}
            Some(false) => {
                return Ok(ToolResult {
                    tool_name: "multiedit".into(),
                    success: false,
                    output: saved_denial_message("Multiedit"),
                });
            }
            None => {
                if let Some(decision) = request_approval(
                    approval_callback,
                    ApprovalRequest::new(
                        ApprovalRequestKind::FileEdit {
                            path: file_path.to_path_buf(),
                        },
                        "Allow these edits?",
                        diff.lines().take(40).map(str::to_string).collect(),
                    ),
                )
                .await
                {
                    if !approval_allows(decision) {
                        return Ok(ToolResult {
                            tool_name: "multiedit".into(),
                            success: false,
                            output: "User denied multiedit".into(),
                        });
                    }
                    persist_file_permission_decision(
                        decision,
                        FilePermissionOperation::MultiEdit,
                        &permission_paths,
                    );
                } else {
                    if stdin_is_noninteractive() {
                        abort_noninteractive_auto_deny("multiedit", "Applying these edits");
                    }
                    eprintln!(
                        "{}",
                        format!(
                            "  Diff for {} ({} edits):",
                            sanitize_terminal_text(&path),
                            edits.len()
                        )
                        .dimmed()
                    );
                    print_diff_preview(&diff);

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
            }
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
        match read_text_file_limited(&file_path, MAX_TEXT_READ_BYTES).await {
            Ok((content, byte_truncated)) => {
                if !byte_truncated {
                    crate::file_state::record_file_read(&file_path, &content);
                }
                let lines: Vec<&str> = content.lines().take(MAX_FILE_LINES).collect();
                let truncated = if byte_truncated {
                    format!(
                        "\n[... truncated at {} bytes; file was not marked fully read for editing]",
                        MAX_TEXT_READ_BYTES
                    )
                } else if content.lines().count() > MAX_FILE_LINES {
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
mod conflict_tests {
    use super::*;

    const CONFLICTED: &str =
        "head\n<<<<<<< HEAD\nours\n||||||| base\nbase\n=======\ntheirs\n>>>>>>> feature\ntail\n";

    #[test]
    fn a_conflicted_read_reports_all_three_sides() {
        let workspace = tempfile::tempdir().expect("workspace");
        let path = workspace.path().join("app.txt");
        std::fs::write(&path, CONFLICTED).expect("write fixture");

        let view = conflict_view(&path, CONFLICTED).expect("a conflict view");

        assert!(view.contains("1 hunk(s)"));
        assert!(view.contains("hunk 1 base:"));
        assert!(view.contains("hunk 1 ours:"));
        assert!(view.contains("hunk 1 theirs:"));
        assert!(view.contains("nothing here picks a side for you"));
        assert!(conflict_view(&path, "clean\n").is_none());
    }

    #[test]
    fn a_write_that_introduces_markers_is_refused() {
        assert!(conflict_marker_refusal("app.txt", "clean\n", CONFLICTED)
            .is_some_and(|message| message.contains("merge conflict markers")));
        assert!(conflict_marker_refusal("app.txt", CONFLICTED, "resolved\n").is_none());
        assert!(conflict_marker_refusal("app.txt", "clean\n", "still clean\n").is_none());
    }
}

#[cfg(test)]
mod path_feedback_tests {
    use super::*;

    /// A bare "not found" is advice-free and the model retries its invention;
    /// naming what is there makes the refusal a correction.
    #[test]
    fn a_near_miss_path_is_answered_with_what_exists() {
        let workspace = tempfile::tempdir().expect("workspace");
        let src = workspace.path().join("src");
        std::fs::create_dir(&src).expect("create src");
        std::fs::write(src.join("router.ts"), "export {}").expect("write fixture");

        let message = missing_path_message(&src.join("routes.ts"));

        assert!(message.starts_with("Path does not exist:"), "{message}");
        assert!(message.contains("router.ts"), "{message}");
    }

    #[test]
    fn an_invented_path_with_no_near_miss_says_so_and_names_the_way_out() {
        let workspace = tempfile::tempdir().expect("workspace");
        std::fs::create_dir(workspace.path().join("src")).expect("create src");

        let message = missing_path_message(&workspace.path().join("src").join("zzzzzz.rs"));

        assert!(
            message.contains("Nothing in this repository matches it"),
            "{message}"
        );
        assert!(message.contains("glob"), "{message}");
    }

    #[test]
    fn a_one_line_fix_sent_as_a_full_rewrite_is_refused_and_pointed_at_edit_file() {
        let old: String = (0..80).map(|i| format!("line {i}\n")).collect();
        let new = old.replace("line 40\n", "line forty\n");

        let refusal = rewrite_guard_refusal("src/big.rs", &old, &new).expect("guard must fire");

        assert!(refusal.contains("only 2 differ"), "{refusal}");
        assert!(refusal.contains("edit_file"), "{refusal}");
    }

    #[test]
    fn a_genuine_rewrite_and_a_short_file_both_pass_the_guard() {
        let old: String = (0..80).map(|i| format!("line {i}\n")).collect();
        let rewritten: String = (0..80).map(|i| format!("row {i}\n")).collect();
        assert!(rewrite_guard_refusal("src/big.rs", &old, &rewritten).is_none());

        let short: String = (0..10).map(|i| format!("line {i}\n")).collect();
        let short_edit = short.replace("line 3\n", "line three\n");
        assert!(rewrite_guard_refusal("src/small.rs", &short, &short_edit).is_none());

        assert!(rewrite_guard_refusal("src/big.rs", &old, &old).is_none());
    }

    /// The bound comes from the change, not the file size.
    #[test]
    fn the_guard_scales_with_the_share_of_the_file_that_changed() {
        let old: String = (0..60).map(|i| format!("line {i}\n")).collect();
        let two_changed = old.replace("line 1\n", "a\n").replace("line 2\n", "b\n");
        assert!(rewrite_guard_refusal("f", &old, &two_changed).is_some());

        let many_changed = (0..60)
            .map(|i| {
                if i % 2 == 0 {
                    format!("x {i}\n")
                } else {
                    format!("line {i}\n")
                }
            })
            .collect::<String>();
        assert!(rewrite_guard_refusal("f", &old, &many_changed).is_none());
    }

    /// A diff is ordinary tool output, so the shared size bound applies to it.
    #[test]
    fn a_huge_diff_is_bounded_before_it_reaches_the_model() {
        let diff: String = (0..40_000)
            .map(|i| format!("+added line {i} with enough text to matter\n"))
            .collect();
        assert!(diff.len() > 1_000_000, "fixture must exceed the cap");

        let bounded = truncate_output_with_save("apply_patch", diff.clone());

        assert!(bounded.len() < diff.len() / 10, "diff was not bounded");
        assert!(bounded.contains("lines omitted"), "{}", &bounded[..200]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    /// The preview is the operator's only look at the change before the
    /// confirm prompt; a hunk carrying OSC/CSI bytes used to reach the.
    #[test]
    fn diff_preview_strips_escape_sequences_from_hunks() {
        let payload = "\u{1b}]52;c;cm0gLXJmIC8=\u{7}\u{1b}[2J\u{1b}[1;1H";
        let rendered = diff_preview_lines(&format!(
            "+ added {payload}line\n- removed {payload}line\n  ctx"
        ))
        .join("\n");

        assert!(
            !rendered.contains("52;c;cm0gLXJmIC8="),
            "OSC 52 payload survived: {rendered:?}"
        );
        assert!(
            !rendered.contains("[2J"),
            "screen-clear CSI survived: {rendered:?}"
        );
        assert!(
            rendered.contains("added line") && rendered.contains("removed line"),
            "diff text was mangled: {rendered:?}"
        );
    }

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
    async fn write_file_allow_session_skips_later_prompt_for_same_path() {
        let tmp = tempfile::tempdir_in(".").expect("tempdir");
        let path = tmp.path().join("session.txt");
        let approval_count = std::sync::Arc::new(std::sync::Mutex::new(0usize));
        let count_for_callback = std::sync::Arc::clone(&approval_count);
        let callback: ApprovalCallback = std::sync::Arc::new(move |_request| {
            let count_for_callback = std::sync::Arc::clone(&count_for_callback);
            Box::pin(async move {
                *count_for_callback.lock().expect("approval count lock") += 1;
                crate::tui::approval_broker::ApprovalDecision::AllowSession
            })
        });

        let mut args = HashMap::new();
        args.insert("path".to_string(), path.display().to_string());
        args.insert("content".to_string(), "first\n".to_string());

        let first = execute_write_file(&args, true, Some(&callback))
            .await
            .unwrap();
        assert!(first.success, "{}", first.output);
        let validated_after_first = validate_file_path(&path.display().to_string()).unwrap();
        let perms_after_first = crate::permissions::PermissionStore::load().unwrap();
        assert_eq!(
            perms_after_first.check_file(FilePermissionOperation::Write, &validated_after_first),
            Some(true)
        );

        args.insert("content".to_string(), "second\n".to_string());
        let second = execute_write_file(&args, true, Some(&callback))
            .await
            .unwrap();

        assert!(second.success, "{}", second.output);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "second\n");
        assert_eq!(*approval_count.lock().expect("approval count lock"), 1);
    }

    #[test]
    fn patch_target_paths_extracts_workspace_files() {
        let tmp = tempfile::tempdir_in(".").expect("tempdir");
        let path = tmp.path().join("patch-target.txt");
        std::fs::write(&path, "old\n").expect("write file");
        let target = path.to_string_lossy();
        let patch = format!(
            "diff --git a/{target} b/{target}\n--- a/{target}\n+++ b/{target}\n@@ -1,1 +1,1 @@\n-old\n+new\n"
        );

        let paths = patch_target_paths(&patch).expect("patch targets");

        assert_eq!(paths.len(), 1);
        assert!(paths[0].ends_with(Path::new("patch-target.txt")));
    }

    #[test]
    fn targetless_patch_permission_uses_content_hash() {
        let paths = patch_permission_paths("not a unified diff").expect("permission target");

        assert_eq!(paths.len(), 1);
        assert!(
            paths[0].to_string_lossy().starts_with("patch-sha256:"),
            "unexpected target: {}",
            paths[0].display()
        );
    }

    #[tokio::test]
    async fn apply_patch_approval_request_includes_target_files() {
        let tmp = tempfile::tempdir_in(".").expect("tempdir");
        let path = tmp.path().join("patch-request.txt");
        std::fs::write(&path, "old\n").expect("write file");
        let target = path.to_string_lossy();
        let patch = format!(
            "diff --git a/{target} b/{target}\n--- a/{target}\n+++ b/{target}\n@@ -1,1 +1,1 @@\n-old\n+new\n"
        );
        let seen_kind: std::sync::Arc<std::sync::Mutex<Option<ApprovalRequestKind>>> =
            std::sync::Arc::new(std::sync::Mutex::new(None));
        let seen_for_callback = std::sync::Arc::clone(&seen_kind);
        let callback: ApprovalCallback = std::sync::Arc::new(move |request| {
            let seen_for_callback = std::sync::Arc::clone(&seen_for_callback);
            Box::pin(async move {
                *seen_for_callback.lock().expect("seen lock") = Some(request.kind);
                crate::tui::approval_broker::ApprovalDecision::Deny
            })
        });
        let args = HashMap::from([("patch".to_string(), patch)]);

        let result = execute_apply_patch(&args, true, Some(&callback))
            .await
            .unwrap();

        assert!(!result.success);
        let seen = seen_kind.lock().expect("seen lock").clone();
        match seen {
            Some(ApprovalRequestKind::Patch { files }) => {
                assert_eq!(files.len(), 1);
                assert!(files[0].ends_with(Path::new("patch-request.txt")));
            }
            other => panic!("expected patch approval kind, got {other:?}"),
        }
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "old\n");
    }

    #[tokio::test]
    async fn write_file_requires_read_state_for_existing_file() {
        let tmp = tempfile::tempdir_in(".").expect("tempdir");
        let path = tmp.path().join("file.txt");
        std::fs::write(&path, "alpha\n").expect("write file");

        let mut args = HashMap::new();
        args.insert("path".to_string(), path.display().to_string());
        args.insert("content".to_string(), "beta\n".to_string());

        let result = execute_write_file(&args, false, None).await.unwrap();

        assert!(!result.success);
        assert!(result.output.contains("File has not been read yet"));
    }

    #[tokio::test]
    async fn write_file_uses_approval_callback() {
        let tmp = tempfile::tempdir_in(".").expect("tempdir");
        let path = tmp.path().join("new.txt");
        let seen_kind: std::sync::Arc<std::sync::Mutex<Option<ApprovalRequestKind>>> =
            std::sync::Arc::new(std::sync::Mutex::new(None));
        let seen_for_callback = std::sync::Arc::clone(&seen_kind);
        let callback: ApprovalCallback = std::sync::Arc::new(move |request| {
            let seen_for_callback = std::sync::Arc::clone(&seen_for_callback);
            Box::pin(async move {
                *seen_for_callback.lock().expect("seen lock") = Some(request.kind);
                crate::tui::approval_broker::ApprovalDecision::Deny
            })
        });

        let mut args = HashMap::new();
        args.insert("path".to_string(), path.display().to_string());
        args.insert("content".to_string(), "beta\n".to_string());

        let result = execute_write_file(&args, true, Some(&callback))
            .await
            .unwrap();

        assert!(!result.success);
        assert_eq!(result.output, "User denied file write");
        assert!(!path.exists());
        assert_eq!(
            *seen_kind.lock().expect("seen lock"),
            Some(ApprovalRequestKind::FileWrite { path })
        );
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

        let edit_result = execute_edit_file(&edit_args, false, None).await.unwrap();

        assert!(edit_result.success, "{}", edit_result.output);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "beta\n");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_write_through_a_symlink_changes_its_target_and_keeps_the_link() {
        let tmp = tempfile::tempdir_in(".").expect("tempdir");
        let target = tmp.path().join("notes.md");
        let link = tmp.path().join("linked-notes.md");
        std::fs::write(&target, "alpha\n").expect("write target");
        std::os::unix::fs::symlink("notes.md", &link).expect("symlink");
        let link_arg = || {
            let mut args = HashMap::new();
            args.insert("path".to_string(), link.display().to_string());
            args
        };
        assert!(execute_read_file(&link_arg()).await.unwrap().success);

        let mut edit_args = link_arg();
        edit_args.insert("old_string".to_string(), "alpha".to_string());
        edit_args.insert("new_string".to_string(), "beta".to_string());
        let edited = execute_edit_file(&edit_args, false, None).await.unwrap();
        assert!(edited.success, "{}", edited.output);

        let mut write_args = link_arg();
        write_args.insert("content".to_string(), "gamma\n".to_string());
        let written = execute_write_file(&write_args, false, None).await.unwrap();
        assert!(written.success, "{}", written.output);

        let link_meta = std::fs::symlink_metadata(&link).expect("link metadata");
        assert!(
            link_meta.file_type().is_symlink(),
            "the write replaced the link with a regular file"
        );
        assert_eq!(
            std::fs::read_link(&link).expect("read link"),
            Path::new("notes.md")
        );
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "gamma\n");
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

        let result = execute_multiedit(&args, false, None).await.unwrap();

        assert!(!result.success);
        assert!(result.output.contains("File has not been read yet"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "alpha\n");
    }
}
