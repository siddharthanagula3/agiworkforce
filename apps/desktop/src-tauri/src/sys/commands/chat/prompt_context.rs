use crate::core::llm::models_config;
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

/// Maximum character length for project instruction content.
const MAX_PROJECT_INSTRUCTIONS_LEN: usize = 16_000;

/// Load project-specific instructions from well-known files in the project root.
///
/// Checks the following files in order and returns the first one found:
/// 1. `.agi/instructions.md`
/// 2. `CLAUDE.md`
/// 3. `.cursor/rules`
///
/// Content is truncated to 16,000 characters to fit within context budgets.
pub fn load_project_instructions(folder: &std::path::Path) -> Option<String> {
    let candidates = [
        folder.join(".agi/instructions.md"),
        folder.join("CLAUDE.md"),
        folder.join(".cursor/rules"),
    ];

    for path in &candidates {
        if path.is_file() {
            match std::fs::read_to_string(path) {
                Ok(content) if !content.trim().is_empty() => {
                    let truncated: String =
                        content.chars().take(MAX_PROJECT_INSTRUCTIONS_LEN).collect();
                    debug!(
                        "[PromptContext] Loaded project instructions from {:?} ({} chars{})",
                        path,
                        truncated.len(),
                        if truncated.len() < content.len() {
                            ", truncated"
                        } else {
                            ""
                        }
                    );
                    return Some(truncated);
                }
                Ok(_) => {
                    // File exists but is empty — continue to next candidate
                }
                Err(e) => {
                    debug!("[PromptContext] Could not read {:?}: {}", path, e);
                }
            }
        }
    }

    None
}

/// Detect the primary project type by probing for language-specific manifest files.
///
/// Returns one of: "Rust", "Node/TypeScript", "Go", "Python", "Mixed", or "Unknown".
pub fn detect_project_type(folder: &std::path::Path) -> String {
    let markers = [
        ("Cargo.toml", "Rust"),
        ("package.json", "Node/TypeScript"),
        ("go.mod", "Go"),
        ("pyproject.toml", "Python"),
    ];

    let mut found: Vec<&str> = Vec::new();
    for (file, lang) in &markers {
        if folder.join(file).exists() {
            found.push(lang);
        }
    }

    match found.len() {
        0 => "Unknown".to_string(),
        1 => found[0].to_string(),
        _ => "Mixed".to_string(),
    }
}

/// Build a concise coding system prompt (under 2K tokens) with:
/// - Project type detection
/// - Working directory path
/// - Tool usage instructions
/// - Project instructions (if found via `load_project_instructions`)
pub fn build_coding_system_prompt(folder: &std::path::Path) -> String {
    let project_type = detect_project_type(folder);
    let folder_display = folder.to_string_lossy();

    let mut prompt = format!(
        "## Coding Context\n\n\
         - **Project type:** {}\n\
         - **Working directory:** {}\n\n\
         ### Tool usage guidelines\n\n\
         - Use `grep_search` instead of running grep via terminal.\n\
         - Use `glob_search` instead of running find via terminal.\n\
         - Use `edit_exact_replace` instead of sed for file edits.\n\
         - Always read a file before editing it.\n",
        project_type, folder_display
    );

    // Add top-level directory listing so the LLM knows what files exist
    if let Ok(entries) = std::fs::read_dir(folder) {
        let mut files: Vec<String> = Vec::new();
        let mut dirs: Vec<String> = Vec::new();
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            // Skip hidden files and common noise
            if name.starts_with('.')
                || name == "node_modules"
                || name == "target"
                || name == "dist"
                || name == ".next"
            {
                continue;
            }
            if entry.path().is_dir() {
                dirs.push(format!("  {}/", name));
            } else {
                files.push(format!("  {}", name));
            }
        }
        dirs.sort();
        files.sort();
        if !dirs.is_empty() || !files.is_empty() {
            prompt.push_str("\n### Project structure (top-level)\n\n```\n");
            for d in &dirs {
                prompt.push_str(d);
                prompt.push('\n');
            }
            for f in &files {
                prompt.push_str(f);
                prompt.push('\n');
            }
            prompt.push_str("```\n\n");
            prompt.push_str("Use `file_list` to explore subdirectories before reading files. Always use full absolute paths.\n");
        }
    }

    if let Some(instructions) = load_project_instructions(folder) {
        prompt.push_str("\n### Project Instructions\n\n");
        prompt.push_str(&instructions);
        prompt.push('\n');
    }

    prompt
}

/// Escape XML special characters to prevent injection into XML-like prompt tags.
pub(super) fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Check if a model is likely to support vision.
///
/// Authoritative source: `packages/types/src/models.json` (`capabilities.vision`).
/// Looked up first via the canonical catalog.  For models not in the catalog
/// (custom Ollama tags, brand-new releases that haven't been added yet,
/// prefix-only sniffing, etc.) we fall back to a list of FAMILY SUBSTRINGS —
/// these are intentionally generic prefixes (`"gpt-4"`, `"claude-3"`, …),
/// not specific model IDs, so they keep matching new versions like
/// `gpt-4o-2024-11`, `claude-3-5-sonnet`, etc.
pub(super) fn model_likely_supports_vision(model: &str) -> bool {
    // 1. Authoritative catalog lookup (post-canonicalization, e.g. "claude-opus-4-6"
    //    -> "claude-opus-4.6").  If the model is in the catalog we trust the flag.
    let canonical = models_config::get_canonicalized_id(model);
    if let Some(entry) = models_config::get_all_model_entries().get(&canonical) {
        return entry.capabilities.vision;
    }

    // 2. Heuristic family-substring fallback for unknown / unreleased models.
    //    These are family prefixes (NOT specific catalog IDs) and rule
    //    `rule-models-json.md` does not apply — they're substring patterns.
    let model_lower = model.to_lowercase();
    let vision_families = [
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

    vision_families
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
