use std::collections::HashMap;
use std::path::PathBuf;

use once_cell::sync::Lazy;

use crate::safety::DANGEROUS_COMMANDS;
use crate::secret_redaction::redact_tool_output;
use crate::terminal_style as ts;

pub(super) static SCRIPT_RE: Lazy<regex::Regex> =
    Lazy::new(|| regex::Regex::new(r"(?is)<script[^>]*>.*?</script>").expect("valid regex"));
pub(super) static STYLE_RE: Lazy<regex::Regex> =
    Lazy::new(|| regex::Regex::new(r"(?is)<style[^>]*>.*?</style>").expect("valid regex"));

pub(super) const MAX_OUTPUT_BYTES: usize = 50 * 1024;
pub(super) const MAX_OUTPUT_LINES: usize = 2000;
pub(super) const TRUNCATION_HEAD_LINES: usize = 30;
pub(super) const TRUNCATION_TAIL_LINES: usize = 30;
const TRUNCATION_MARK_RESERVE: usize = 512;
pub(super) const MAX_FILE_LINES: usize = 2_000;
pub(super) const MAX_LINE_LENGTH: usize = 2_000;
pub(crate) const COMMAND_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

pub(super) fn validate_file_path(path_str: &str) -> std::result::Result<PathBuf, String> {
    crate::path_security::validate_workspace_path(path_str)
}

pub(super) fn validate_file_write_path(path_str: &str) -> std::result::Result<PathBuf, String> {
    crate::path_security::validate_workspace_write_path(path_str)
}

pub(super) use crate::path_security::display_path;

/// The TUI renders every tool call as its own transcript cell, and a stderr
/// write while it owns the terminal lands outside ratatui's buffer, so this
/// line is only for the exec and REPL surfaces.
pub(super) fn print_tool_status(tool_name: &str, display: &str) {
    if crate::tui::tui_active() {
        return;
    }
    let display = redact_tool_output(display);
    if let Some(line) = crate::output::screen_reader_tool_line(tool_name, &display) {
        eprintln!("{line}");
        return;
    }
    eprintln!(
        "  {} {}",
        ts::accent_header(format!("[{}]", tool_name)),
        ts::muted(display)
    );
}

pub(super) fn describe_command(command: &str) -> String {
    redact_tool_output(&describe_command_shape(command))
}

fn describe_command_shape(command: &str) -> String {
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

/// Every tool funnels its model-facing output through here, so this is the one
/// place credential material is scrubbed before it reaches the transcript, the
/// model, or the overflow file saved under the config directory.
pub(super) fn truncate_output_with_save(tool_name: &str, output: String) -> String {
    let output = redact_tool_output(&output);
    let lines: Vec<&str> = output.lines().collect();
    let max_bytes = tool_size_cap(tool_name);
    let needs_truncation = output.len() > max_bytes || lines.len() > MAX_OUTPUT_LINES;

    if !needs_truncation {
        return output;
    }

    let saved_path = save_full_output(tool_name, &output);
    let mut truncated = truncate_by_lines(&lines);
    if truncated.len() > max_bytes {
        truncated = truncate_by_bytes(&output, max_bytes);
    }

    if let Some(path) = saved_path {
        truncated.push_str(&format!(
            "\n[full output saved for the user to {path}, outside the workspace where \
             read_file cannot open it; narrow the call to see the omitted part]"
        ));
    }

    truncated
}

/// The first and last bytes of `output` that fit in `max_bytes`, cut on
/// character boundaries, around a mark that says how much is left out.
fn truncate_by_bytes(output: &str, max_bytes: usize) -> String {
    let keep = max_bytes.saturating_sub(TRUNCATION_MARK_RESERVE) / 2;
    let mut head_end = keep.min(output.len());
    while !output.is_char_boundary(head_end) {
        head_end -= 1;
    }
    let mut tail_start = output.len().saturating_sub(keep).max(head_end);
    while !output.is_char_boundary(tail_start) {
        tail_start += 1;
    }
    let omitted = &output[head_end..tail_start];
    let line_breaks = omitted.matches('\n').count();
    let mark = if line_breaks == 0 {
        format!("[... {} bytes omitted ...]", omitted.len())
    } else {
        format!(
            "[... {} lines omitted ({} bytes) ...]",
            line_breaks,
            omitted.len()
        )
    };
    format!(
        "{}\n\n{mark}\n\n{}",
        &output[..head_end],
        &output[tail_start..]
    )
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

pub(crate) fn format_size(bytes: u64) -> String {
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

const DIFF_CELL_BUDGET: usize = 4_000_000;

/// A line diff of `old` and `new` in bounded memory: the common start and
/// end are set aside, the rest is compared exactly while the comparison table
/// fits [`DIFF_CELL_BUDGET`], split at lines found once on each side when it
/// does not, and shown as removed then added where neither works.
pub(crate) fn generate_simple_diff(old: &str, new: &str) -> String {
    let old_lines: Vec<&str> = old.lines().collect();
    let new_lines: Vec<&str> = new.lines().collect();
    let mut budget = DIFF_CELL_BUDGET;
    let mut marked = Vec::with_capacity(old_lines.len().max(new_lines.len()));
    diff_lines(&old_lines, &new_lines, true, &mut budget, &mut marked);

    let mut result = String::new();
    for (mark, line) in marked {
        result.push(mark);
        result.push_str(line);
        result.push('\n');
    }
    if result.ends_with('\n') {
        result.pop();
    }
    result
}

fn diff_lines<'a>(
    old: &[&'a str],
    new: &[&'a str],
    split_at_unique_lines: bool,
    budget: &mut usize,
    marked: &mut Vec<(char, &'a str)>,
) {
    let prefix = old
        .iter()
        .zip(new)
        .take_while(|(left, right)| left == right)
        .count();
    let (old_rest, new_rest) = (&old[prefix..], &new[prefix..]);
    let suffix = old_rest
        .iter()
        .rev()
        .zip(new_rest.iter().rev())
        .take_while(|(left, right)| left == right)
        .count();
    let old_middle = &old_rest[..old_rest.len() - suffix];
    let new_middle = &new_rest[..new_rest.len() - suffix];

    marked.extend(old[..prefix].iter().map(|line| (' ', *line)));
    let cells = (old_middle.len() + 1).saturating_mul(new_middle.len() + 1);
    let both_sides_changed = !old_middle.is_empty() && !new_middle.is_empty();
    if both_sides_changed && cells <= *budget {
        *budget -= cells;
        compared_line_by_line(old_middle, new_middle, marked);
    } else if both_sides_changed && split_at_unique_lines {
        let anchors = lines_found_once_on_each_side(old_middle, new_middle);
        let (mut old_at, mut new_at) = (0, 0);
        for (old_index, new_index) in anchors {
            diff_lines(
                &old_middle[old_at..old_index],
                &new_middle[new_at..new_index],
                false,
                budget,
                marked,
            );
            marked.push((' ', old_middle[old_index]));
            old_at = old_index + 1;
            new_at = new_index + 1;
        }
        diff_lines(
            &old_middle[old_at..],
            &new_middle[new_at..],
            false,
            budget,
            marked,
        );
    } else {
        removed_then_added(old_middle, new_middle, marked);
    }
    marked.extend(
        old_rest[old_rest.len() - suffix..]
            .iter()
            .map(|line| (' ', *line)),
    );
}

fn removed_then_added<'a>(old: &[&'a str], new: &[&'a str], marked: &mut Vec<(char, &'a str)>) {
    marked.extend(old.iter().map(|line| ('-', *line)));
    marked.extend(new.iter().map(|line| ('+', *line)));
}

fn compared_line_by_line<'a>(old: &[&'a str], new: &[&'a str], marked: &mut Vec<(char, &'a str)>) {
    let (n, m) = (old.len(), new.len());
    let width = m + 1;
    let mut common = vec![0u32; (n + 1) * width];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            common[i * width + j] = if old[i] == new[j] {
                common[(i + 1) * width + j + 1] + 1
            } else {
                common[(i + 1) * width + j].max(common[i * width + j + 1])
            };
        }
    }

    let (mut i, mut j) = (0, 0);
    while i < n || j < m {
        if i < n && j < m && old[i] == new[j] {
            marked.push((' ', old[i]));
            i += 1;
            j += 1;
        } else if i < n && (j >= m || common[(i + 1) * width + j] >= common[i * width + j + 1]) {
            marked.push(('-', old[i]));
            i += 1;
        } else {
            marked.push(('+', new[j]));
            j += 1;
        }
    }
}

/// The pairs of positions of lines that occur exactly once in `old` and once
/// in `new`, longest run in the same order on both sides.
fn lines_found_once_on_each_side(old: &[&str], new: &[&str]) -> Vec<(usize, usize)> {
    let mut seen: HashMap<&str, (usize, usize, usize, usize)> = HashMap::new();
    for (index, line) in old.iter().enumerate() {
        let entry = seen.entry(*line).or_insert((0, 0, 0, 0));
        entry.0 += 1;
        entry.1 = index;
    }
    for (index, line) in new.iter().enumerate() {
        if let Some(entry) = seen.get_mut(*line) {
            entry.2 += 1;
            entry.3 = index;
        }
    }
    let mut pairs: Vec<(usize, usize)> = seen
        .values()
        .filter(|entry| entry.0 == 1 && entry.2 == 1)
        .map(|entry| (entry.1, entry.3))
        .collect();
    pairs.sort_unstable();

    let mut tails: Vec<usize> = Vec::new();
    let mut previous: Vec<Option<usize>> = vec![None; pairs.len()];
    for (index, &(_, new_index)) in pairs.iter().enumerate() {
        let length = tails.partition_point(|&tail| pairs[tail].1 < new_index);
        if length > 0 {
            previous[index] = Some(tails[length - 1]);
        }
        if length == tails.len() {
            tails.push(index);
        } else {
            tails[length] = index;
        }
    }
    let mut chain = Vec::with_capacity(tails.len());
    let mut cursor = tails.last().copied();
    while let Some(index) = cursor {
        chain.push(pairs[index]);
        cursor = previous[index];
    }
    chain.reverse();
    chain
}

/// The most lines of a change a prompt carries. A change that is longer says
/// so in the prompt, so nothing is approved as if it had been shown.
pub(crate) const PROMPT_CHANGE_LINES: usize = 400;

/// `text` as the lines of a change, each after `mark`: `+` for what is
/// added, `-` for what is removed.
pub(crate) fn marked_lines(mark: char, text: &str) -> Vec<String> {
    text.lines().map(|line| format!("{mark} {line}")).collect()
}

/// The lines of a change as a prompt carries them: all of them to
/// [`PROMPT_CHANGE_LINES`], and after that one line that says how many more
/// there are.
pub(crate) fn capped_change(mut lines: Vec<String>) -> Vec<String> {
    if lines.len() > PROMPT_CHANGE_LINES {
        let hidden = lines.len() - PROMPT_CHANGE_LINES;
        lines.truncate(PROMPT_CHANGE_LINES);
        lines.push(format!(
            "… {hidden} more line(s) of this change are not shown here"
        ));
    }
    lines
}

/// What a prompt for a change to files shows: every file the answer covers
/// first, each on a line of its own, and then the change itself
/// ([`capped_change`]). One yes applies all of it, so a patch is not asked
/// about with its first lines and no list of what it touches, nor a new file
/// with only its length.
pub(crate) fn change_detail(targets: &[String], change: Vec<String>) -> Vec<String> {
    let mut detail: Vec<String> = targets
        .iter()
        .map(|target| format!("file: {target}"))
        .collect();
    detail.extend(capped_change(change));
    detail
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
        // raw byte index can land mid-codepoint and panic.
        let truncated: String = line.chars().take(MAX_LINE_LENGTH).collect();
        format!("{truncated}... [truncated]")
    }
}

#[cfg(test)]
mod tests {
    use super::{describe_command, generate_simple_diff, tool_size_cap, truncate_output_with_save};

    #[test]
    fn a_one_line_change_in_a_huge_file_is_diffed_without_a_quadratic_table() {
        let old: String = (0..60_000).map(|i| format!("row {i}\n")).collect();
        let new = old.replace("row 30000\n", "row thirty thousand\n");
        let started = std::time::Instant::now();

        let diff = generate_simple_diff(&old, &new);

        assert!(started.elapsed() < std::time::Duration::from_secs(10));
        assert!(
            diff.contains("\n-row 30000\n+row thirty thousand\n"),
            "missing change"
        );
        assert_eq!(diff.lines().count(), 60_001);
    }

    #[test]
    fn changes_at_both_ends_of_a_huge_file_split_at_lines_found_once() {
        let old: String = (0..30_000).map(|i| format!("row {i}\n")).collect();
        let new = format!("{}tail\n", old.replacen("row 0\n", "head\n", 1));

        let diff = generate_simple_diff(&old, &new);
        let lines: Vec<&str> = diff.lines().collect();

        assert_eq!(&lines[..2], ["-row 0", "+head"]);
        assert_eq!(lines.last(), Some(&"+tail"));
        assert_eq!(
            lines.iter().filter(|line| line.starts_with(' ')).count(),
            29_999
        );
    }

    #[test]
    fn a_change_too_large_to_compare_is_shown_as_removed_then_added() {
        let repeated = "same\n".repeat(3_000);
        let old = format!("first\n{repeated}");
        let new = format!("{repeated}last\n");

        let diff = generate_simple_diff(&old, &new);
        let lines: Vec<&str> = diff.lines().collect();

        assert_eq!(lines.len(), 6_002);
        assert_eq!(
            lines.iter().filter(|line| line.starts_with('-')).count(),
            3_001
        );
        assert_eq!(
            lines.iter().filter(|line| line.starts_with('+')).count(),
            3_001
        );
    }

    #[test]
    fn a_single_line_over_the_cap_is_cut_to_the_cap() {
        for tool in ["web_fetch", "run_command"] {
            let cap = tool_size_cap(tool);
            let output = truncate_output_with_save(tool, "x".repeat(cap * 3));

            assert!(output.len() <= cap + 512, "{tool}: {} bytes", output.len());
            assert!(output.contains("bytes omitted"), "{tool}");
        }
    }

    #[test]
    fn every_tools_output_is_redacted_before_it_reaches_the_model_or_the_saved_file() {
        let output = truncate_output_with_save(
            "run_command",
            "Exit code: 0\nANTHROPIC_API_KEY=sk-ant-api03-0123456789abcdefghijklmnop\nok\n"
                .to_string(),
        );

        assert!(!output.contains("sk-ant-api03-0123456789abcdefghijklmnop"));
        assert!(output.contains("[REDACTED_ANTHROPIC_KEY]"));
        assert!(output.contains("Exit code: 0"));
        assert!(output.contains("ok"));
    }

    #[test]
    fn a_command_summary_never_carries_the_credential_it_was_given() {
        let summary = describe_command(
            "git push https://agi:ghp_0123456789abcdefghijklmnopqrstuvwx@github.com/acme/app.git",
        );

        assert!(!summary.contains("ghp_0123456789abcdefghijklmnopqrstuvwx"));
        assert!(summary.contains("[CREDENTIALS_REDACTED]"));
    }

    #[test]
    fn redaction_does_not_truncate_output_that_fits() {
        let plain = "line one\nline two".to_string();
        assert_eq!(
            truncate_output_with_save("run_command", plain.clone()),
            plain
        );
    }
}
