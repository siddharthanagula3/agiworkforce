// apps/desktop/src-tauri/src/sys/commands/chat/tool_events.rs

use serde::Serialize;
use serde_json::Value;
use tauri::Emitter;

/// Structured tool event emitted to the frontend during agentic loop execution.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToolEvent {
    Started {
        id: String,
        conversation_id: i64,
        message_id: String,
        tool_name: String,
        display_name: String,
        display_args: String,
        iteration: usize,
    },
    Progress {
        id: String,
        conversation_id: i64,
        message_id: String,
        stdout_chunk: Option<String>,
        progress_pct: Option<f32>,
    },
    Completed {
        id: String,
        conversation_id: i64,
        message_id: String,
        success: bool,
        duration_ms: u64,
        result_preview: Option<String>,
        error: Option<String>,
    },
}

/// Human-readable display info for a tool call.
pub struct ToolDisplayInfo {
    pub display_name: String,
    pub display_args: String,
}

/// Maps a raw MCP tool name + JSON arguments to a Claude Code-style display label.
///
/// Examples:
///   mcp__filesystem__read_file + {"path":"src/main.rs"} → Read(src/main.rs)
///   mcp__bash__execute + {"command":"cargo test"} → Bash(cargo test)
pub fn get_tool_display_info(tool_name: &str, arguments_json: &str) -> ToolDisplayInfo {
    let args: Value = serde_json::from_str(arguments_json).unwrap_or_default();
    let lower = tool_name.to_lowercase();

    // Extract common argument fields
    let path = args
        .get("path")
        .or_else(|| args.get("file_path"))
        .or_else(|| args.get("filename"))
        .and_then(|v| v.as_str())
        .map(shorten_path);
    let command = args
        .get("command")
        .or_else(|| args.get("cmd"))
        .and_then(|v| v.as_str())
        .map(|s| truncate(s, 60));
    let query = args
        .get("query")
        .or_else(|| args.get("pattern"))
        .or_else(|| args.get("search"))
        .and_then(|v| v.as_str())
        .map(|s| truncate(s, 50));
    let url = args
        .get("url")
        .or_else(|| args.get("uri"))
        .and_then(|v| v.as_str())
        .map(|s| truncate(s, 60));

    let (name, arg_display) = if contains_any(&lower, &["read_file", "read_text", "read_media"]) {
        ("Read", path.unwrap_or_default())
    } else if contains_any(&lower, &["write_file", "write_text"]) {
        ("Write", path.unwrap_or_default())
    } else if contains_any(&lower, &["edit_file", "edit", "patch"]) {
        ("Edit", path.unwrap_or_default())
    } else if contains_any(&lower, &["list_directory", "directory_tree", "list_dir"]) {
        ("LS", path.unwrap_or_else(|| ".".to_string()))
    } else if contains_any(&lower, &["search_files", "grep", "find_files", "glob"]) {
        ("Search", query.unwrap_or_default())
    } else if contains_any(&lower, &["bash", "execute", "terminal", "shell", "run_command"]) {
        ("Bash", command.unwrap_or_default())
    } else if contains_any(&lower, &["web_search", "search_web"]) {
        ("WebSearch", query.unwrap_or_default())
    } else if contains_any(&lower, &["navigate", "web_fetch", "fetch_url", "browse"]) {
        ("WebFetch", url.unwrap_or_default())
    } else if contains_any(
        &lower,
        &[
            "create_entities",
            "create_relations",
            "add_observations",
            "memory",
        ],
    ) {
        ("Memory", query.or(path).unwrap_or_default())
    } else if contains_any(
        &lower,
        &["git_status", "git_diff", "git_log", "git_commit", "git_"],
    ) {
        let git_cmd = lower
            .rsplit("__")
            .next()
            .unwrap_or("git")
            .replace('_', " ");
        ("Git", truncate(&git_cmd, 30))
    } else if contains_any(&lower, &["image_generate", "dalle", "generate_image"]) {
        let prompt = args
            .get("prompt")
            .and_then(|v| v.as_str())
            .map(|s| truncate(s, 40));
        ("ImageGen", prompt.unwrap_or_default())
    } else {
        // Fallback: extract the last segment of the MCP tool name
        let short_name = tool_name.rsplit("__").next().unwrap_or(tool_name);
        let display = path.or(command).or(query).or(url).unwrap_or_default();
        (short_name, display)
    };

    ToolDisplayInfo {
        display_name: name.to_string(),
        display_args: arg_display,
    }
}

/// Emit a ToolEvent to the frontend via Tauri event system.
pub fn emit_tool_event(app_handle: &tauri::AppHandle, event: &ToolEvent) {
    let _ = app_handle.emit("tool:event", event);
}

pub fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| haystack.contains(n))
}

pub fn shorten_path(p: &str) -> String {
    // Show only filename or last 2 path segments
    let parts: Vec<&str> = p.split('/').filter(|s| !s.is_empty()).collect();
    if parts.len() <= 2 {
        p.to_string()
    } else {
        parts[parts.len() - 2..].join("/")
    }
}

pub fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max.saturating_sub(3)])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- get_tool_display_info: filesystem tools ---

    #[test]
    fn test_read_file_display() {
        let info = get_tool_display_info(
            "mcp__filesystem__read_file",
            r#"{"path": "src/main.rs"}"#,
        );
        assert_eq!(info.display_name, "Read");
        // "src/main.rs" has only 2 path segments — shorten_path returns as-is
        assert_eq!(info.display_args, "src/main.rs");
    }

    #[test]
    fn test_read_file_long_path_shortened() {
        let info = get_tool_display_info(
            "mcp__filesystem__read_file",
            r#"{"path": "apps/desktop/src/components/Auth/AuthPage.tsx"}"#,
        );
        assert_eq!(info.display_name, "Read");
        // Long path — only last 2 segments shown
        assert_eq!(info.display_args, "Auth/AuthPage.tsx");
    }

    #[test]
    fn test_write_file_display() {
        let info = get_tool_display_info(
            "mcp__filesystem__write_file",
            r#"{"path": "output.txt"}"#,
        );
        assert_eq!(info.display_name, "Write");
        assert_eq!(info.display_args, "output.txt");
    }

    #[test]
    fn test_edit_file_display() {
        let info = get_tool_display_info(
            "mcp__filesystem__edit_file",
            r#"{"path": "src/lib.rs"}"#,
        );
        assert_eq!(info.display_name, "Edit");
        assert_eq!(info.display_args, "src/lib.rs");
    }

    #[test]
    fn test_list_directory_display_uses_dot_when_no_path() {
        let info = get_tool_display_info(
            "mcp__filesystem__list_directory",
            r#"{}"#,
        );
        assert_eq!(info.display_name, "LS");
        assert_eq!(info.display_args, ".");
    }

    #[test]
    fn test_list_directory_with_path() {
        let info = get_tool_display_info(
            "mcp__filesystem__list_directory",
            r#"{"path": "src"}"#,
        );
        assert_eq!(info.display_name, "LS");
        assert_eq!(info.display_args, "src");
    }

    #[test]
    fn test_directory_tree_display() {
        let info = get_tool_display_info(
            "mcp__filesystem__directory_tree",
            r#"{"path": "apps/desktop"}"#,
        );
        assert_eq!(info.display_name, "LS");
        assert_eq!(info.display_args, "apps/desktop");
    }

    // --- get_tool_display_info: bash / terminal tools ---

    #[test]
    fn test_bash_execute_display() {
        let info = get_tool_display_info(
            "mcp__bash__execute",
            r#"{"command": "cargo test"}"#,
        );
        assert_eq!(info.display_name, "Bash");
        assert_eq!(info.display_args, "cargo test");
    }

    #[test]
    fn test_terminal_execute_display() {
        let info = get_tool_display_info(
            "mcp__terminal__execute",
            r#"{"command": "npm install"}"#,
        );
        assert_eq!(info.display_name, "Bash");
        assert_eq!(info.display_args, "npm install");
    }

    #[test]
    fn test_run_command_display() {
        let info = get_tool_display_info(
            "mcp__shell__run_command",
            r#"{"command": "ls -la"}"#,
        );
        assert_eq!(info.display_name, "Bash");
        assert_eq!(info.display_args, "ls -la");
    }

    #[test]
    fn test_bash_cmd_field_fallback() {
        // Uses "cmd" field instead of "command"
        let info = get_tool_display_info(
            "mcp__bash__execute",
            r#"{"cmd": "echo hello"}"#,
        );
        assert_eq!(info.display_name, "Bash");
        assert_eq!(info.display_args, "echo hello");
    }

    // --- get_tool_display_info: search tools ---

    #[test]
    fn test_search_files_display() {
        let info = get_tool_display_info(
            "mcp__grep__search_files",
            r#"{"pattern": "error handler"}"#,
        );
        assert_eq!(info.display_name, "Search");
        assert_eq!(info.display_args, "error handler");
    }

    #[test]
    fn test_glob_display() {
        let info = get_tool_display_info(
            "mcp__filesystem__glob",
            r#"{"pattern": "**/*.rs"}"#,
        );
        assert_eq!(info.display_name, "Search");
        assert_eq!(info.display_args, "**/*.rs");
    }

    // --- get_tool_display_info: web search / fetch ---

    #[test]
    fn test_web_search_display() {
        let info = get_tool_display_info(
            "mcp__search__web_search",
            r#"{"query": "Rust async patterns"}"#,
        );
        assert_eq!(info.display_name, "WebSearch");
        assert_eq!(info.display_args, "Rust async patterns");
    }

    #[test]
    fn test_search_web_display() {
        let info = get_tool_display_info(
            "mcp__search__search_web",
            r#"{"query": "tauri v2 commands"}"#,
        );
        assert_eq!(info.display_name, "WebSearch");
        assert_eq!(info.display_args, "tauri v2 commands");
    }

    #[test]
    fn test_navigate_display() {
        let info = get_tool_display_info(
            "mcp__browser__navigate",
            r#"{"url": "https://example.com"}"#,
        );
        assert_eq!(info.display_name, "WebFetch");
        assert_eq!(info.display_args, "https://example.com");
    }

    #[test]
    fn test_web_fetch_with_uri_field() {
        let info = get_tool_display_info(
            "mcp__browser__web_fetch",
            r#"{"uri": "https://docs.rs"}"#,
        );
        assert_eq!(info.display_name, "WebFetch");
        assert_eq!(info.display_args, "https://docs.rs");
    }

    // --- get_tool_display_info: git tools ---

    #[test]
    fn test_git_status_display() {
        let info = get_tool_display_info(
            "mcp__git__git_status",
            r#"{}"#,
        );
        assert_eq!(info.display_name, "Git");
        assert_eq!(info.display_args, "git status");
    }

    #[test]
    fn test_git_commit_display() {
        let info = get_tool_display_info(
            "mcp__git__git_commit",
            r#"{"message": "feat: add tests"}"#,
        );
        assert_eq!(info.display_name, "Git");
        assert_eq!(info.display_args, "git commit");
    }

    #[test]
    fn test_git_diff_display() {
        let info = get_tool_display_info(
            "mcp__git__git_diff",
            r#"{}"#,
        );
        assert_eq!(info.display_name, "Git");
        assert_eq!(info.display_args, "git diff");
    }

    // --- get_tool_display_info: memory tools ---

    #[test]
    fn test_create_entities_display() {
        let info = get_tool_display_info(
            "mcp__memory__create_entities",
            r#"{"query": "agent context"}"#,
        );
        assert_eq!(info.display_name, "Memory");
        // query is preferred over path for Memory
        assert_eq!(info.display_args, "agent context");
    }

    #[test]
    fn test_add_observations_display() {
        let info = get_tool_display_info(
            "mcp__memory__add_observations",
            r#"{}"#,
        );
        assert_eq!(info.display_name, "Memory");
        assert_eq!(info.display_args, "");
    }

    // --- get_tool_display_info: image generation ---

    #[test]
    fn test_image_generate_display() {
        let info = get_tool_display_info(
            "mcp__image__image_generate",
            r#"{"prompt": "a sunset over mountains"}"#,
        );
        assert_eq!(info.display_name, "ImageGen");
        assert_eq!(info.display_args, "a sunset over mountains");
    }

    // --- get_tool_display_info: unknown / fallback tool ---

    #[test]
    fn test_unknown_tool_falls_back_to_last_segment() {
        let info = get_tool_display_info(
            "mcp__custom__my_tool",
            r#"{"query": "test"}"#,
        );
        // Fallback uses the last __ segment as display name
        assert_eq!(info.display_name, "my_tool");
        // query field is extracted as display_args
        assert_eq!(info.display_args, "test");
    }

    #[test]
    fn test_unknown_tool_no_known_args() {
        let info = get_tool_display_info(
            "mcp__custom__do_something",
            r#"{"arbitrary": "value"}"#,
        );
        assert_eq!(info.display_name, "do_something");
        assert_eq!(info.display_args, "");
    }

    #[test]
    fn test_bare_tool_name_no_segments() {
        // Tool name with no double-underscore separator
        let info = get_tool_display_info(
            "my_bare_tool",
            r#"{}"#,
        );
        // rsplit("__").next() returns the whole string when no __ present
        assert_eq!(info.display_name, "my_bare_tool");
    }

    // --- get_tool_display_info: malformed / edge-case JSON ---

    #[test]
    fn test_invalid_json_args_does_not_panic() {
        // serde_json::from_str with unwrap_or_default() gives a Null value
        let info = get_tool_display_info(
            "mcp__filesystem__read_file",
            "not valid json",
        );
        assert_eq!(info.display_name, "Read");
        // path will be None → empty string
        assert_eq!(info.display_args, "");
    }

    #[test]
    fn test_empty_args_json() {
        let info = get_tool_display_info(
            "mcp__filesystem__write_file",
            r#"{}"#,
        );
        assert_eq!(info.display_name, "Write");
        assert_eq!(info.display_args, "");
    }

    #[test]
    fn test_null_field_value_treated_as_missing() {
        let info = get_tool_display_info(
            "mcp__bash__execute",
            r#"{"command": null}"#,
        );
        assert_eq!(info.display_name, "Bash");
        // as_str() on null returns None → empty
        assert_eq!(info.display_args, "");
    }

    // --- shorten_path ---

    #[test]
    fn test_shorten_path_single_segment() {
        assert_eq!(shorten_path("main.rs"), "main.rs");
    }

    #[test]
    fn test_shorten_path_two_segments_unchanged() {
        assert_eq!(shorten_path("src/main.rs"), "src/main.rs");
    }

    #[test]
    fn test_shorten_path_three_segments_returns_last_two() {
        assert_eq!(shorten_path("apps/src/main.rs"), "src/main.rs");
    }

    #[test]
    fn test_shorten_path_long() {
        assert_eq!(
            shorten_path("apps/desktop/src/components/Auth/AuthPage.tsx"),
            "Auth/AuthPage.tsx",
        );
    }

    #[test]
    fn test_shorten_path_empty_string() {
        // No non-empty segments → parts is empty → len <= 2 → returns as-is
        assert_eq!(shorten_path(""), "");
    }

    #[test]
    fn test_shorten_path_with_leading_slash() {
        // Leading slash creates empty segment that is filtered; parts = ["etc","passwd"]
        assert_eq!(shorten_path("/etc/passwd"), "/etc/passwd");
    }

    #[test]
    fn test_shorten_path_three_with_leading_slash() {
        // Filtered parts = ["usr","local","bin"] → last 2 → "local/bin"
        assert_eq!(shorten_path("/usr/local/bin"), "local/bin");
    }

    // --- truncate ---

    #[test]
    fn test_truncate_short_string_unchanged() {
        assert_eq!(truncate("short", 10), "short");
    }

    #[test]
    fn test_truncate_exact_length_unchanged() {
        assert_eq!(truncate("exactly10c", 10), "exactly10c");
    }

    #[test]
    fn test_truncate_long_string_adds_ellipsis() {
        // max=15, truncates to 12 chars + "..."
        assert_eq!(truncate("this is a very long string", 15), "this is a ve...");
    }

    #[test]
    fn test_truncate_max_zero_returns_ellipsis() {
        // max=0: saturating_sub(3) = 0, &s[..0] = "", → "..."
        assert_eq!(truncate("hello", 0), "...");
    }

    #[test]
    fn test_truncate_max_three_returns_ellipsis() {
        // max=3: saturating_sub(3) = 0, → "..."
        assert_eq!(truncate("hello", 3), "...");
    }

    #[test]
    fn test_truncate_max_four_keeps_one_char() {
        // max=4: saturating_sub(3) = 1, &s[..1] = "h", → "h..."
        assert_eq!(truncate("hello", 4), "h...");
    }

    #[test]
    fn test_truncate_empty_string() {
        assert_eq!(truncate("", 10), "");
    }

    // --- contains_any ---

    #[test]
    fn test_contains_any_match() {
        assert!(contains_any("mcp__bash__execute", &["bash", "shell"]));
    }

    #[test]
    fn test_contains_any_no_match() {
        assert!(!contains_any("mcp__custom__tool", &["bash", "shell"]));
    }

    #[test]
    fn test_contains_any_empty_needles() {
        assert!(!contains_any("anything", &[]));
    }

    #[test]
    fn test_contains_any_first_needle_matches() {
        assert!(contains_any("read_file", &["read_file", "write_file"]));
    }

    #[test]
    fn test_contains_any_second_needle_matches() {
        assert!(contains_any("write_file", &["read_file", "write_file"]));
    }
}
