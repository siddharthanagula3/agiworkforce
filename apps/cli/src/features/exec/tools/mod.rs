use std::collections::HashMap;

use anyhow::Result;

use crate::agent::ToolCall;

mod bash;
mod common;
mod dir_ops;
mod file_ops;
mod git;
mod task_registry;
mod web;

pub use task_registry::session_task_summaries;

use bash::execute_run_command;
use common::print_tool_status;
#[cfg(test)]
use common::{
    format_size, generate_simple_diff, is_dangerous_command, tool_size_cap, truncate_by_lines,
    truncate_line, truncate_output_with_save, MAX_FILE_LINES, MAX_LINE_LENGTH, MAX_OUTPUT_BYTES,
    MAX_OUTPUT_LINES, TRUNCATION_HEAD_LINES, TRUNCATION_TAIL_LINES,
};
use dir_ops::{execute_glob, execute_grep_files, execute_list_directory, execute_search_files};
use file_ops::{
    execute_apply_patch, execute_multiedit, execute_read_file, execute_read_many_files,
    execute_write_file,
};
use git::{execute_enter_worktree, execute_exit_worktree, execute_list_worktrees};
use task_registry::{
    execute_advisor, execute_ask_user, execute_cron_create, execute_cron_delete,
    execute_cron_list, execute_lsp_completion, execute_lsp_definition,
    execute_lsp_diagnostics, execute_lsp_document_symbols, execute_lsp_format,
    execute_lsp_hover, execute_task_create, execute_task_get, execute_task_list,
    execute_task_output, execute_task_stop, execute_task_update, execute_team_create,
    execute_team_delete, execute_todo_read, execute_todo_write,
};
use web::{execute_tool_search, execute_web_fetch, execute_web_search};
#[cfg(test)]
use web::is_private_or_internal_ip;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

pub struct ToolResult {
    #[allow(dead_code)]
    pub tool_name: String,
    pub success: bool,
    pub output: String,
}

#[derive(Clone, Copy)]
pub struct ToolExecOptions {
    pub require_confirmation: bool,
    pub auto_approve_safe: bool,
    pub quiet: bool,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

#[allow(dead_code)]
pub async fn execute_tool(call: &ToolCall, require_confirmation: bool) -> Result<ToolResult> {
    let opts = ToolExecOptions {
        require_confirmation,
        auto_approve_safe: false,
        quiet: false,
    };
    execute_tool_with_opts(call, &opts).await
}

pub async fn execute_tool_with_opts(call: &ToolCall, opts: &ToolExecOptions) -> Result<ToolResult> {
    let is_safe_tool = matches!(
        call.name.as_str(),
        "read_file"
            | "search_files"
            | "list_directory"
            | "web_search"
            | "web_fetch"
            | "glob"
            | "todo_read"
            | "ask_user"
            | "tool_search"
            | "grep_files"
            | "task_get"
            | "task_list"
            | "task_output"
            | "cron_list"
            | "lsp_completion"
            | "lsp_document_symbols"
            | "lsp_format"
    );
    let require_confirm = opts.require_confirmation && !(opts.auto_approve_safe && is_safe_tool);

    let result = match call.name.as_str() {
        "read_file" => execute_read_file_with_opts(&call.args, opts.quiet).await,
        "write_file" => execute_write_file(&call.args, require_confirm).await,
        "run_command" => execute_run_command(&call.args, require_confirm).await,
        "search_files" => execute_search_files_with_opts(&call.args, opts.quiet).await,
        "list_directory" => execute_list_directory_with_opts(&call.args, opts.quiet).await,
        "edit_file" => file_ops::execute_edit_file(&call.args, require_confirm).await,
        "web_search" => execute_web_search_with_opts(&call.args, opts.quiet).await,
        "web_fetch" => execute_web_fetch_with_opts(&call.args, opts.quiet).await,
        "apply_patch" => execute_apply_patch(&call.args, require_confirm).await,
        "grep_files" => execute_grep_files(&call.args, opts.quiet).await,
        "tool_search" => execute_tool_search(&call.args).await,
        "glob" => execute_glob(&call.args).await,
        "batch" => Box::pin(execute_batch(call, opts)).await,
        "multiedit" => execute_multiedit(&call.args, require_confirm).await,
        "todo_read" => execute_todo_read().await,
        "todo_write" => execute_todo_write(&call.args).await,
        "ask_user" => execute_ask_user(&call.args).await,
        "read_many_files" => execute_read_many_files(&call.args).await,
        "task_create" => execute_task_create(&call.args).await,
        "task_get" => execute_task_get(&call.args).await,
        "task_list" => execute_task_list(&call.args).await,
        "task_update" => execute_task_update(&call.args).await,
        "task_stop" => execute_task_stop(&call.args).await,
        "task_output" => execute_task_output(&call.args).await,
        "team_create" => execute_team_create(&call.args).await,
        "team_delete" => execute_team_delete(&call.args).await,
        "cron_create" => execute_cron_create(&call.args).await,
        "cron_delete" => execute_cron_delete(&call.args).await,
        "cron_list" => execute_cron_list(&call.args).await,
        "advisor" => execute_advisor(&call.args).await,
        "enter_worktree" => execute_enter_worktree(&call.args).await,
        "exit_worktree" => execute_exit_worktree(&call.args).await,
        "list_worktrees" => execute_list_worktrees(&call.args).await,
        "lsp_definition" => execute_lsp_definition(&call.args).await,
        "lsp_hover" => execute_lsp_hover(&call.args).await,
        "lsp_diagnostics" => execute_lsp_diagnostics(&call.args).await,
        "lsp_completion" => execute_lsp_completion(&call.args).await,
        "lsp_document_symbols" => execute_lsp_document_symbols(&call.args).await,
        "lsp_format" => execute_lsp_format(&call.args).await,
        _ => Ok(ToolResult {
            tool_name: call.name.clone(),
            success: false,
            output: format!("Unknown tool: {}", call.name),
        }),
    };

    result
}

// ---------------------------------------------------------------------------
// Quiet-mode wrappers
// ---------------------------------------------------------------------------

async fn execute_read_file_with_opts(
    args: &HashMap<String, String>,
    quiet: bool,
) -> Result<ToolResult> {
    if quiet {
        file_ops::execute_read_file_inner(args).await
    } else {
        execute_read_file(args).await
    }
}

async fn execute_search_files_with_opts(
    args: &HashMap<String, String>,
    _quiet: bool,
) -> Result<ToolResult> {
    execute_search_files(args).await
}

async fn execute_list_directory_with_opts(
    args: &HashMap<String, String>,
    _quiet: bool,
) -> Result<ToolResult> {
    execute_list_directory(args).await
}

async fn execute_web_search_with_opts(
    args: &HashMap<String, String>,
    _quiet: bool,
) -> Result<ToolResult> {
    execute_web_search(args).await
}

async fn execute_web_fetch_with_opts(
    args: &HashMap<String, String>,
    _quiet: bool,
) -> Result<ToolResult> {
    execute_web_fetch(args).await
}

// ---------------------------------------------------------------------------
// Tool: batch
// ---------------------------------------------------------------------------

async fn execute_batch(call: &ToolCall, opts: &ToolExecOptions) -> Result<ToolResult> {
    let calls_json = match call.args.get("tool_calls") {
        Some(j) => j,
        None => {
            return Ok(ToolResult {
                tool_name: "batch".into(),
                success: false,
                output: "Missing required argument: tool_calls (JSON array)".into(),
            });
        }
    };

    let parsed: Vec<serde_json::Value> = serde_json::from_str(calls_json)
        .map_err(|e| anyhow::anyhow!("Invalid tool_calls JSON: {}", e))?;

    const MAX_BATCH: usize = 25;
    if parsed.len() > MAX_BATCH {
        return Ok(ToolResult {
            tool_name: "batch".into(),
            success: false,
            output: format!(
                "Batch limited to {} tool calls, got {}",
                MAX_BATCH,
                parsed.len()
            ),
        });
    }

    print_tool_status("batch", &format!("Batch({} tools)", parsed.len()));

    let mut results: Vec<Result<ToolResult>> = Vec::new();
    for item in &parsed {
        let name = item
            .get("tool")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let args: HashMap<String, String> = item
            .get("args")
            .and_then(|v| v.as_object())
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default();

        let tool_call = ToolCall { name, args };
        results.push(execute_tool_with_opts(&tool_call, opts).await);
    }

    let mut output_parts = Vec::new();
    let mut success_count = 0usize;
    let total = results.len();

    for (i, result) in results.into_iter().enumerate() {
        match result {
            Ok(tr) => {
                if tr.success {
                    success_count += 1;
                }
                output_parts.push(format!(
                    "[{}/{}] {} — {}: {}",
                    i + 1,
                    total,
                    if tr.success { "OK" } else { "FAIL" },
                    tr.tool_name,
                    tr.output.lines().next().unwrap_or("(empty)")
                ));
            }
            Err(e) => {
                output_parts.push(format!("[{}/{}] ERROR: {}", i + 1, total, e));
            }
        }
    }

    Ok(ToolResult {
        tool_name: "batch".into(),
        success: success_count == total,
        output: format!(
            "Batch complete: {}/{} succeeded\n{}",
            success_count,
            total,
            output_parts.join("\n")
        ),
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_size_cap_per_tool() {
        assert_eq!(tool_size_cap("read_file"), 100_000);
        assert_eq!(tool_size_cap("web_fetch"), 200_000);
        assert_eq!(tool_size_cap("web_search"), 100_000);
        assert_eq!(tool_size_cap("run_command"), 50_000);
        assert_eq!(tool_size_cap("list_directory"), 20_000);
        assert_eq!(tool_size_cap("write_file"), 5_000);
        assert_eq!(tool_size_cap("unknown_tool"), MAX_OUTPUT_BYTES);
    }

    #[test]
    fn test_truncate_respects_per_tool_cap() {
        let big_output: String = (0..1000)
            .map(|i| format!("line {} {}", i, "x".repeat(70)))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(big_output.len() > 50_000 && big_output.len() < 100_000);

        let truncated = truncate_output_with_save("run_command", big_output.clone());
        assert!(
            truncated.len() < big_output.len(),
            "run_command should truncate {}-byte output (cap=50K), got {} bytes back",
            big_output.len(),
            truncated.len()
        );

        let unchanged = truncate_output_with_save("web_fetch", big_output.clone());
        assert_eq!(
            unchanged.len(),
            big_output.len(),
            "web_fetch should not truncate {}-byte output (cap=200K)",
            big_output.len()
        );
    }

    #[test]
    fn test_is_dangerous_command() {
        assert!(is_dangerous_command("sudo apt install foo"));
        assert!(is_dangerous_command("kill -9 1234"));
        assert!(is_dangerous_command("/usr/bin/sudo rm foo"));
        assert!(is_dangerous_command("echo hello | sudo rm foo"));

        assert!(!is_dangerous_command("ls -la"));
        assert!(!is_dangerous_command("cat /etc/hosts"));
        assert!(!is_dangerous_command("echo hello"));
        assert!(!is_dangerous_command("grep -rn pattern ."));
        assert!(!is_dangerous_command("pwd"));
    }

    #[test]
    fn test_truncate_output_short_passthrough() {
        let short = "hello world".to_string();
        assert_eq!(truncate_output_with_save("test", short.clone()), short);
    }

    #[test]
    fn test_truncate_output_over_max_lines() {
        let line_count = MAX_OUTPUT_LINES + 100;
        let lines: Vec<String> = (0..line_count).map(|i| format!("line {}", i)).collect();
        let input = lines.join("\n");

        let truncated = truncate_output_with_save("test", input);

        assert!(truncated.contains("[..."));
        assert!(truncated.contains("lines omitted"));

        assert!(truncated.contains("line 0"));
        assert!(truncated.contains(&format!("line {}", line_count - 1)));

        let mid = line_count / 2;
        assert!(!truncated.contains(&format!("line {}\n", mid)));
    }

    #[test]
    fn test_truncate_output_over_max_bytes() {
        let big_line = "x".repeat(1024);
        let line_count = 100;
        let lines: Vec<String> = (0..line_count)
            .map(|i| format!("{}: {}", i, big_line))
            .collect();
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
        let total = TRUNCATION_HEAD_LINES + TRUNCATION_TAIL_LINES;
        let lines: Vec<String> = (0..total).map(|i| format!("line {}", i)).collect();
        let refs: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();

        let result = truncate_by_lines(&refs);
        assert!(!result.contains("omitted"));
        assert_eq!(result.lines().count(), total);
    }

    #[test]
    fn test_truncate_by_lines_one_over_boundary() {
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

    #[test]
    fn test_diff_identical_content() {
        let text = "line 1\nline 2\nline 3";
        let diff = generate_simple_diff(text, text);
        for line in diff.lines() {
            assert!(
                line.starts_with(' '),
                "expected context line, got: {}",
                line
            );
        }
        assert_eq!(diff.lines().count(), 3);
    }

    #[test]
    fn test_diff_empty_to_content() {
        let diff = generate_simple_diff("", "hello\nworld");
        assert_eq!(diff, "+hello\n+world");
    }

    #[test]
    fn test_diff_content_to_empty() {
        let diff = generate_simple_diff("hello\nworld", "");
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

        assert_eq!(lines[0], " alpha");
        assert!(lines.contains(&"-beta"));
        assert!(lines.contains(&"+BETA"));
        assert!(lines.contains(&"-delta"));
        assert!(lines.contains(&"+zeta"));
    }

    #[tokio::test]
    async fn test_read_file_start_line() {
        let tmp = tempfile::NamedTempFile::new_in(".").unwrap();
        let content = (1..=10)
            .map(|i| format!("line {}", i))
            .collect::<Vec<_>>()
            .join("\n");
        std::fs::write(tmp.path(), &content).unwrap();

        let mut args = HashMap::new();
        args.insert("path".to_string(), tmp.path().display().to_string());
        args.insert("start_line".to_string(), "5".to_string());

        let result = execute_read_file(&args).await.unwrap();
        assert!(result.success);
        assert!(result.output.contains("line 5"));
        assert!(result.output.contains("line 10"));
        assert!(!result.output.contains("\tline 4\n"));
    }

    #[tokio::test]
    async fn test_read_file_end_line() {
        let tmp = tempfile::NamedTempFile::new_in(".").unwrap();
        let content = (1..=10)
            .map(|i| format!("line {}", i))
            .collect::<Vec<_>>()
            .join("\n");
        std::fs::write(tmp.path(), &content).unwrap();

        let mut args = HashMap::new();
        args.insert("path".to_string(), tmp.path().display().to_string());
        args.insert("end_line".to_string(), "3".to_string());

        let result = execute_read_file(&args).await.unwrap();
        assert!(result.success);
        assert!(result.output.contains("line 1"));
        assert!(result.output.contains("line 3"));
        assert!(!result.output.contains("\tline 4\n"));
    }

    #[tokio::test]
    async fn test_read_file_start_and_end_line() {
        let tmp = tempfile::NamedTempFile::new_in(".").unwrap();
        let content = (1..=20)
            .map(|i| format!("line {}", i))
            .collect::<Vec<_>>()
            .join("\n");
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
        assert!(result
            .output
            .contains("To read more, call read_file with start_line: 11"));
    }

    #[tokio::test]
    async fn test_read_file_empty_range() {
        let tmp = tempfile::NamedTempFile::new_in(".").unwrap();
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

    #[tokio::test]
    async fn test_web_search_missing_query() {
        let args = HashMap::new();
        let result = execute_web_search(&args).await.unwrap();
        assert!(!result.success);
        assert!(result.output.contains("Missing required argument: query"));
    }

    #[tokio::test]
    async fn test_web_search_no_api_key() {
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
        assert!(!result.success);
        assert!(
            result.output.contains("Failed to fetch")
                || result.output.contains("URL blocked")
                || result.output.contains("Invalid URL"),
            "Expected error message, got: {}",
            result.output
        );
    }

    #[test]
    fn test_strip_html_tags_basic() {
        use web::strip_html_tags_pub;
        let html = "<p>Hello <b>world</b></p>";
        assert_eq!(strip_html_tags_pub(html), "Hello world");
    }

    #[test]
    fn test_strip_html_tags_empty() {
        use web::strip_html_tags_pub;
        assert_eq!(strip_html_tags_pub(""), "");
    }

    #[test]
    fn test_strip_html_tags_no_tags() {
        use web::strip_html_tags_pub;
        assert_eq!(strip_html_tags_pub("plain text"), "plain text");
    }

    #[test]
    fn test_strip_html_tags_nested() {
        use web::strip_html_tags_pub;
        let html = "<div><p>nested <span>content</span></p></div>";
        assert_eq!(strip_html_tags_pub(html), "nested content");
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

#[cfg(test)]
mod path_validation_regressions {
    use super::*;

    fn args(pairs: &[(&str, &str)]) -> std::collections::HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[tokio::test]
    async fn read_many_files_refuses_paths_outside_project() {
        let payload = serde_json::to_string(&vec!["/etc/hosts", "/etc/shadow"]).unwrap();
        let result = execute_read_many_files(&args(&[("paths", &payload)]))
            .await
            .expect("tool execution should not error out");

        assert!(
            result.output.contains("Refusing to read outside project"),
            "expected per-path rejection message, got: {}",
            result.output
        );
        assert!(!result.success, "tool should report failure when no path could be read");
    }

    #[tokio::test]
    async fn glob_refuses_absolute_pattern() {
        let result = execute_glob(&args(&[("pattern", "/etc/*.conf")]))
            .await
            .expect("tool should return ToolResult, not error");
        assert!(
            result.output.contains("Refusing absolute glob pattern"),
            "expected absolute-pattern rejection, got: {}",
            result.output
        );
        assert!(!result.success);
    }

    #[tokio::test]
    async fn glob_refuses_outside_base_path() {
        let result = execute_glob(&args(&[
            ("pattern", "*.txt"),
            ("path", "/etc"),
        ]))
        .await
        .expect("tool should return ToolResult");
        assert!(
            result.output.contains("Refusing to glob outside project"),
            "expected base-path rejection, got: {}",
            result.output
        );
    }

    #[tokio::test]
    async fn list_directory_refuses_filesystem_root() {
        let result = execute_list_directory(&args(&[("path", "/etc")]))
            .await
            .expect("tool should return ToolResult");
        assert!(
            result.output.contains("Refusing to list outside project"),
            "expected list_directory containment, got: {}",
            result.output
        );
        assert!(!result.success);
    }

    #[tokio::test]
    async fn list_directory_allows_project_relative_paths() {
        let result = execute_list_directory(&args(&[("path", ".")]))
            .await
            .expect("tool should return ToolResult");
        assert!(
            !result.output.contains("Refusing to list outside project"),
            "in-project path was wrongly refused: {}",
            result.output
        );
    }
}

#[cfg(test)]
mod private_ip_classifier_tests {
    use super::is_private_or_internal_ip;
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

    fn v4(a: u8, b: u8, c: u8, d: u8) -> IpAddr {
        IpAddr::V4(Ipv4Addr::new(a, b, c, d))
    }

    #[test]
    fn rejects_aws_imds_169_254() {
        assert!(is_private_or_internal_ip(&v4(169, 254, 169, 254)));
    }

    #[test]
    fn rejects_rfc1918_ranges() {
        assert!(is_private_or_internal_ip(&v4(10, 0, 0, 1)));
        assert!(is_private_or_internal_ip(&v4(172, 16, 0, 1)));
        assert!(is_private_or_internal_ip(&v4(172, 31, 255, 254)));
        assert!(is_private_or_internal_ip(&v4(192, 168, 1, 1)));
    }

    #[test]
    fn allows_172_32_public_range() {
        assert!(!is_private_or_internal_ip(&v4(172, 32, 0, 1)));
    }

    #[test]
    fn rejects_loopback_and_unspecified() {
        assert!(is_private_or_internal_ip(&v4(127, 0, 0, 1)));
        assert!(is_private_or_internal_ip(&v4(0, 0, 0, 0)));
    }

    #[test]
    fn rejects_cgnat_100_64() {
        assert!(is_private_or_internal_ip(&v4(100, 64, 0, 1)));
        assert!(is_private_or_internal_ip(&v4(100, 127, 255, 254)));
        assert!(!is_private_or_internal_ip(&v4(100, 128, 0, 1)));
        assert!(!is_private_or_internal_ip(&v4(100, 63, 255, 254)));
    }

    #[test]
    fn rejects_multicast_and_reserved() {
        assert!(is_private_or_internal_ip(&v4(224, 0, 0, 1)));
        assert!(is_private_or_internal_ip(&v4(255, 255, 255, 255)));
    }

    #[test]
    fn allows_normal_public_v4() {
        assert!(!is_private_or_internal_ip(&v4(8, 8, 8, 8)));
        assert!(!is_private_or_internal_ip(&v4(1, 1, 1, 1)));
        assert!(!is_private_or_internal_ip(&v4(140, 82, 121, 4)));
    }

    #[test]
    fn rejects_v6_loopback_and_link_local() {
        assert!(is_private_or_internal_ip(&IpAddr::V6(Ipv6Addr::LOCALHOST)));
        assert!(is_private_or_internal_ip(&IpAddr::V6(Ipv6Addr::UNSPECIFIED)));
        assert!(is_private_or_internal_ip(&IpAddr::V6(
            "fe80::1".parse().unwrap()
        )));
        assert!(is_private_or_internal_ip(&IpAddr::V6(
            "fc00::1".parse().unwrap()
        )));
    }

    #[test]
    fn rejects_v4_mapped_v6_of_private_v4() {
        assert!(is_private_or_internal_ip(&IpAddr::V6(
            "::ffff:127.0.0.1".parse().unwrap()
        )));
        assert!(is_private_or_internal_ip(&IpAddr::V6(
            "::ffff:169.254.169.254".parse().unwrap()
        )));
        assert!(is_private_or_internal_ip(&IpAddr::V6(
            "::ffff:10.0.0.1".parse().unwrap()
        )));
    }

    #[test]
    fn allows_normal_public_v6() {
        assert!(!is_private_or_internal_ip(&IpAddr::V6(
            "2001:4860:4860::8888".parse().unwrap()
        )));
    }
}
