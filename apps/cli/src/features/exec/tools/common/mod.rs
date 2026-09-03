use std::path::PathBuf;

use once_cell::sync::Lazy;

use crate::safety::DANGEROUS_COMMANDS;
use crate::terminal_style as ts;

pub(super) static SCRIPT_RE: Lazy<regex::Regex> =
    Lazy::new(|| regex::Regex::new(r"(?is)<script[^>]*>.*?</script>").expect("valid regex"));
pub(super) static STYLE_RE: Lazy<regex::Regex> =
    Lazy::new(|| regex::Regex::new(r"(?is)<style[^>]*>.*?</style>").expect("valid regex"));

pub(super) const MAX_OUTPUT_BYTES: usize = 50 * 1024;
pub(super) const MAX_OUTPUT_LINES: usize = 2000;
pub(super) const TRUNCATION_HEAD_LINES: usize = 30;
pub(super) const TRUNCATION_TAIL_LINES: usize = 30;
pub(super) const MAX_FILE_LINES: usize = 2_000;
pub(super) const MAX_LINE_LENGTH: usize = 2_000;
pub(super) const COMMAND_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

pub(super) fn validate_file_path(path_str: &str) -> std::result::Result<PathBuf, String> {
    crate::path_security::validate_workspace_path(path_str)
}

pub(super) fn validate_file_write_path(path_str: &str) -> std::result::Result<PathBuf, String> {
    crate::path_security::validate_workspace_write_path(path_str)
}

pub(super) fn print_tool_status(tool_name: &str, display: &str) {
    eprintln!(
        "  {} {}",
        ts::accent_header(format!("[{}]", tool_name)),
        ts::muted(display)
    );
}

#[allow(dead_code)]
pub(super) fn print_tool_status_unless_quiet(tool_name: &str, display: &str, quiet: bool) {
    if !quiet {
        print_tool_status(tool_name, display);
    }
}

pub(super) fn describe_command(command: &str) -> String {
    let trimmed = command.trim();
    let first_word = trimmed.split_whitespace().next().unwrap_or("");
    let base = first_word.rsplit('/').next().unwrap_or(first_word);

    match base {
        "rm" => {
            let targets: Vec<&str> = trimmed
                .split_whitespace()
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
            let args: Vec<&str> = trimmed
                .split_whitespace()
                .filter(|a| !a.starts_with('-'))
                .skip(1)
                .collect();
            if args.len() >= 2 {
                format!(
                    "Move {} -> {}",
                    args[..args.len() - 1].join(", "),
                    args[args.len() - 1]
                )
            } else {
                format!("Move files: {}", trimmed)
            }
        }
        "chmod" => format!("Change permissions: {}", cap_chars(trimmed, 200)),
        "chown" | "chgrp" => format!("Change ownership: {}", cap_chars(trimmed, 200)),
        "sudo" => format!(
            "Run as root: {}",
            cap_chars(skip_chars(trimmed, 5).trim(), 200)
        ), // AUDIT-FIX: H-6
        "kill" | "killall" | "pkill" => {
            format!("Send signal to processes: {}", cap_chars(trimmed, 200))
        }
        "git" => format!("Git: {}", cap_chars(skip_chars(trimmed, 4).trim(), 200)), // AUDIT-FIX: H-6
        "npm" | "pnpm" | "yarn" | "cargo" | "pip" => {
            format!("Package manager: {}", cap_chars(trimmed, 200))
        }
        "curl" | "wget" => format!("Download/fetch: {}", cap_chars(trimmed, 200)),
        "docker" => format!("Docker: {}", cap_chars(skip_chars(trimmed, 7).trim(), 200)), // AUDIT-FIX: H-6
        _ => cap_chars(trimmed, 200),
    }
}

fn skip_chars(s: &str, n: usize) -> &str {
    match s.char_indices().nth(n) {
        Some((i, _)) => &s[i..],
        None => "",
    }
}

fn cap_chars(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

#[allow(dead_code)]
pub(super) fn is_dangerous_command(command: &str) -> bool {
    let trimmed = command.trim();
    for segment in trimmed.split(&['|', ';', '&'][..]) {
        let first_word = segment.split_whitespace().next().unwrap_or("");
        let base = first_word.rsplit('/').next().unwrap_or(first_word);
        if DANGEROUS_COMMANDS.contains(&base) {
            return true;
        }
    }
    false
}

pub(super) fn tool_size_cap(tool_name: &str) -> usize {
    crate::runtime::tool_catalog::tool_result_size_cap(tool_name).unwrap_or(MAX_OUTPUT_BYTES)
}

pub(super) fn truncate_output_with_save(tool_name: &str, output: String) -> String {
    let lines: Vec<&str> = output.lines().collect();
    let max_bytes = tool_size_cap(tool_name);
    let needs_truncation = output.len() > max_bytes || lines.len() > MAX_OUTPUT_LINES;

    if !needs_truncation {
        return output;
    }

    let saved_path = save_full_output(tool_name, &output);
    let mut truncated = truncate_by_lines(&lines);

    if let Some(path) = saved_path {
        truncated.push_str(&format!("\n[full output saved to {}]", path));
    }

    truncated
}

pub(super) fn truncate_by_lines(lines: &[&str]) -> String {
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

pub(super) fn save_full_output(tool_name: &str, output: &str) -> Option<String> {
    let dir = crate::config::CliConfig::config_dir()
        .ok()?
        .join("tool-output");
    std::fs::create_dir_all(&dir).ok()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    }

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S_%3f");
    let filename = format!("{}_{}.txt", tool_name, timestamp);
    let path = dir.join(&filename);

    std::fs::write(&path, output).ok()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Some(path.display().to_string())
}

pub(super) fn format_size(bytes: u64) -> String {
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

pub(super) fn generate_simple_diff(old: &str, new: &str) -> String {
    let old_lines: Vec<&str> = old.lines().collect();
    let new_lines: Vec<&str> = new.lines().collect();

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

    if result.ends_with('\n') {
        result.pop();
    }
    result
}

pub(super) fn preview_string(s: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = s.lines().collect();
    if lines.len() <= max_lines {
        s.to_string()
    } else {
        let preview: Vec<&str> = lines[..max_lines].to_vec();
        format!(
            "{}... (+{} more lines)",
            preview.join("\n"),
            lines.len() - max_lines
        )
    }
}

pub(super) fn truncate_line(line: &str) -> String {
    if line.len() <= MAX_LINE_LENGTH {
        line.to_string()
    } else {
        // Truncate on a char boundary: slicing `&line[..MAX_LINE_LENGTH]` on a
        // raw byte index can land mid-codepoint and panic. `chars().take(..)`
        // bounds by chars (mirrors `cap_chars`/`skip_chars` above), keeping the
        // result a valid &str without panicking on multibyte input.
        let truncated: String = line.chars().take(MAX_LINE_LENGTH).collect();
        format!("{truncated}... [truncated]")
    }
}
