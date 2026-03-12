use tracing::debug;

/// Strip control characters and truncate to a maximum length for safe prompt injection.
///
/// Removes all ASCII control characters (below 0x20) except space (0x20), plus DEL (0x7F).
pub(super) fn sanitize_for_prompt(s: &str, max_len: usize) -> String {
    s.chars()
        .filter(|&c| c >= ' ' && c != '\x7F' && c != '`')
        .take(max_len)
        .collect()
}

/// Like [`sanitize_for_prompt`] but preserves newlines and tabs, which are
/// important for multiline content such as selected code snippets.
pub(super) fn sanitize_multiline_for_prompt(s: &str, max_len: usize) -> String {
    s.chars()
        .filter(|&c| (c >= ' ' || c == '\n' || c == '\t') && c != '\x7F' && c != '`')
        .take(max_len)
        .collect()
}

/// Build an OS/platform context string so the LLM knows the user's operating system,
/// architecture, and which shell/path conventions to use.
pub(super) fn build_os_context() -> String {
    let os_name = std::env::consts::OS;
    let os_arch = std::env::consts::ARCH;
    let os_family = std::env::consts::FAMILY;

    match os_name {
        "macos" => format!(
            "## User's System Environment\n\n\
            - **Operating System:** macOS ({})\n\
            - **Architecture:** {}\n\n\
            When running terminal commands, use macOS-compatible commands:\n\
            - Use `ls`, `rm`, `mv`, `cp`, `mkdir` for file operations\n\
            - Use `/` for path separators (e.g., ~/Desktop/file.txt)\n\
            - Use `open` to launch applications or URLs\n\
            - Common shells: zsh (default), bash\n\
            - Home directory: ~/ or $HOME",
            os_family, os_arch
        ),
        "windows" => format!(
            "## User's System Environment\n\n\
            - **Operating System:** Windows ({})\n\
            - **Architecture:** {}\n\n\
            When running terminal commands, use Windows-compatible commands:\n\
            - Use `dir` (or `ls` in PowerShell), `del`/`Remove-Item`, `move`, `copy`, `mkdir` for file operations\n\
            - Use `\\` for path separators (e.g., C:\\Users\\username\\Desktop\\file.txt)\n\
            - Use `start` to launch applications or URLs\n\
            - Prefer PowerShell over cmd.exe for better compatibility\n\
            - Home directory: %USERPROFILE% or $env:USERPROFILE",
            os_family, os_arch
        ),
        "linux" => format!(
            "## User's System Environment\n\n\
            - **Operating System:** Linux ({})\n\
            - **Architecture:** {}\n\n\
            When running terminal commands, use Linux-compatible commands:\n\
            - Use `ls`, `rm`, `mv`, `cp`, `mkdir` for file operations\n\
            - Use `/` for path separators (e.g., ~/Desktop/file.txt)\n\
            - Use `xdg-open` to launch applications or URLs\n\
            - Common shells: bash (default), zsh, fish\n\
            - Home directory: ~/ or $HOME",
            os_family, os_arch
        ),
        _ => format!(
            "## User's System Environment\n\n\
            - **Operating System:** {} ({})\n\
            - **Architecture:** {}\n\n\
            Adapt terminal commands to this platform as appropriate.",
            os_name, os_family, os_arch
        ),
    }
}

/// Build a project folder context message for the LLM, including the project name,
/// path, guidelines, and a summary of the top-level directory structure.
pub(super) fn build_project_context_message(folder: &str) -> String {
    let project_name = std::path::Path::new(folder)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Project");

    let mut project_context_content = format!(
        "## Active Project Folder\n\n\
        The user is currently working in a project folder:\n\
        - **Project Name:** {}\n\
        - **Path:** {}\n\n\
        **Important Guidelines for this session:**\n\
        - When performing file operations, default to working within this project folder unless the user specifies otherwise\n\
        - Use relative paths from the project root when possible\n\
        - For terminal commands, use this folder as the working directory (cwd)\n\
        - When creating new files, place them in appropriate locations within the project structure\n",
        project_name, folder
    );

    if let Ok(files) =
        crate::sys::commands::project_context::project_context_list_files_internal_sync(
            folder, 1, false,
        )
    {
        if !files.is_empty() {
            project_context_content.push_str("\n**Project Structure (top level):**\n```\n");
            for file in files.iter().take(25) {
                let prefix = if file.is_directory {
                    "[DIR] "
                } else {
                    "      "
                };
                project_context_content.push_str(&format!("{}{}\n", prefix, file.name));
            }
            if files.len() > 25 {
                project_context_content
                    .push_str(&format!("... and {} more items\n", files.len() - 25));
            }
            project_context_content.push_str("```\n");
        }
    }

    debug!(
        "[Chat] Built project folder context: {} ({})",
        project_name, folder
    );

    project_context_content
}

/// Escape XML special characters to prevent injection into XML-like prompt tags.
pub(super) fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Check if a model is likely to support vision based on its name.
/// This is a heuristic check - providers should also implement supports_vision().
pub(super) fn model_likely_supports_vision(model: &str) -> bool {
    let model_lower = model.to_lowercase();

    let vision_models = [
        "gpt-4",
        "gpt-5",
        "o1",
        "o3",
        "claude-3",
        "claude-sonnet",
        "claude-opus",
        "claude-haiku",
        "gemini",
        "llava",
        "bakllava",
        "cogvlm",
        "qwen-vl",
        "qwen2-vl",
        "vision",
    ];

    vision_models
        .iter()
        .any(|pattern| model_lower.contains(pattern))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_for_prompt_strips_controls_and_backticks() {
        assert_eq!(sanitize_for_prompt("ok\x00\t`\ntext", 32), "oktext");
    }

    #[test]
    fn sanitize_multiline_for_prompt_preserves_tabs_and_newlines() {
        assert_eq!(
            sanitize_multiline_for_prompt("line 1\n\tline 2`\x07", 32),
            "line 1\n\tline 2"
        );
    }

    #[test]
    fn escape_xml_escapes_special_characters() {
        assert_eq!(escape_xml("a & <b>"), "a &amp; &lt;b&gt;");
    }

    #[test]
    fn model_likely_supports_vision_matches_expected_families() {
        assert!(model_likely_supports_vision("gpt-5.4"));
        assert!(model_likely_supports_vision("claude-3-7-sonnet"));
        assert!(model_likely_supports_vision("gemini-2.5-pro"));
        assert!(!model_likely_supports_vision("text-embedding-3-large"));
    }
}
