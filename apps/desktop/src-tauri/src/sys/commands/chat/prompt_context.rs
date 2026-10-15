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

/// Maximum characters of repository instruction text injected into one turn.
const MAX_PROJECT_INSTRUCTIONS_LEN: usize = 16_000;

/// Instruction files read in each directory, in this order.
const INSTRUCTION_FILE_NAMES: [&str; 3] = ["AGENTS.md", "CLAUDE.md", ".agi/instructions.md"];

/// How far above the project folder the git root is looked for.
const MAX_INSTRUCTION_ANCESTOR_LEVELS: usize = 5;

/// Directories whose instruction files apply to `folder`, nearest first.
///
/// Ancestors are only included up to the enclosing git root, so a folder that
/// is not inside a repository never reads instruction files from the user's
/// home or other unrelated parents.
fn instruction_directories(folder: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut chain = Vec::new();
    let mut current = Some(folder);
    for _ in 0..=MAX_INSTRUCTION_ANCESTOR_LEVELS {
        let Some(dir) = current else { break };
        chain.push(dir.to_path_buf());
        if dir.join(".git").exists() {
            return chain;
        }
        current = dir.parent();
    }
    vec![folder.to_path_buf()]
}

/// Load the repository instruction files that apply to `folder`.
///
/// Reads `AGENTS.md`, then `CLAUDE.md`, then `.agi/instructions.md` in the
/// folder and in each parent up to the git root. Files from the nearest
/// directory come first and win on conflict; the combined text is capped at
/// [`MAX_PROJECT_INSTRUCTIONS_LEN`] characters and says so when it was cut.
pub fn load_project_instructions(folder: &std::path::Path) -> Option<String> {
    let directories = instruction_directories(folder);
    let root = directories
        .last()
        .cloned()
        .unwrap_or_else(|| folder.to_path_buf());
    let mut sections: Vec<String> = Vec::new();
    let mut remaining = MAX_PROJECT_INSTRUCTIONS_LEN;
    let mut truncated = false;

    'directories: for dir in &directories {
        for name in INSTRUCTION_FILE_NAMES {
            let path = dir.join(name);
            if !path.is_file() {
                continue;
            }
            let content = match std::fs::read_to_string(&path) {
                Ok(content) => content,
                Err(e) => {
                    debug!("[PromptContext] Could not read {:?}: {}", path, e);
                    continue;
                }
            };
            let content = content.trim();
            if content.is_empty() {
                continue;
            }
            if remaining == 0 {
                truncated = true;
                break 'directories;
            }
            let kept: String = content.chars().take(remaining).collect();
            let kept_len = kept.chars().count();
            if kept_len < content.chars().count() {
                truncated = true;
            }
            remaining -= kept_len;
            let label = path
                .strip_prefix(&root)
                .unwrap_or(&path)
                .display()
                .to_string();
            sections.push(format!("#### {}\n\n{}", label, kept));
        }
    }

    if sections.is_empty() {
        return None;
    }

    debug!(
        "[PromptContext] Loaded {} instruction file(s){}",
        sections.len(),
        if truncated { ", truncated" } else { "" }
    );

    let mut prompt = String::from(
        "Repository instruction files, nearest directory first. Where they conflict, the nearer file wins.\n\n",
    );
    prompt.push_str(&sections.join("\n\n"));
    if truncated {
        prompt.push_str(&format!(
            "\n\n[Instruction files were cut at {} characters; the rest was not loaded.]",
            MAX_PROJECT_INSTRUCTIONS_LEN
        ));
    }
    Some(prompt)
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
/// - Repository instruction files (see [`load_project_instructions`])
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
         - Always read a file before editing it, then pass the returned `file_version.sha256` as `expected_sha256` to edit or overwrite existing files.\n\
         - Before broad or risky multi-file edits, use `coding_checkpoint_create` for explicit recovery; use `undo_get_changes`, `undo_last`, or `coding_checkpoint_rewind` only with user-approved scope.\n",
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

/// Render the instructions the user set for this chat, for all chats, and in
/// `~/.agiworkforce/INSTRUCTIONS.md`.
///
/// The most specific source comes first and wins: this chat, then all chats,
/// then the instructions file. The file is the broadest source, as it is for
/// the CLI, which loads it before a project's own instruction files so those
/// override it. Returns `None` when no source has text.
pub fn build_user_instructions_prompt(
    global: Option<&str>,
    conversation: Option<&str>,
    instructions_file: Option<&str>,
) -> Option<String> {
    let global = global.map(str::trim).filter(|text| !text.is_empty());
    let conversation = conversation.map(str::trim).filter(|text| !text.is_empty());
    let instructions_file = instructions_file
        .map(str::trim)
        .filter(|text| !text.is_empty());
    if global.is_none() && conversation.is_none() && instructions_file.is_none() {
        return None;
    }

    let mut prompt = String::from(
        "## User Instructions\n\nThe user wrote these instructions. Follow them in every reply unless the current message asks otherwise. Where they conflict, the instructions for this conversation win, then the instructions for all conversations, then the instructions file. Repository instruction files also win over the instructions file.",
    );
    if let Some(conversation) = conversation {
        prompt.push_str("\n\n### This conversation\n\n");
        prompt.push_str(conversation);
    }
    if let Some(global) = global {
        prompt.push_str("\n\n### All conversations\n\n");
        prompt.push_str(global);
    }
    if let Some(instructions_file) = instructions_file {
        prompt.push_str("\n\n### Instructions file (~/.agiworkforce/INSTRUCTIONS.md)\n\n");
        let kept: String = instructions_file
            .chars()
            .take(MAX_PROJECT_INSTRUCTIONS_LEN)
            .collect();
        let cut = kept.chars().count() < instructions_file.chars().count();
        prompt.push_str(&kept);
        if cut {
            prompt.push_str(&format!(
                "\n\n[The instructions file was cut at {} characters; the rest was not loaded.]",
                MAX_PROJECT_INSTRUCTIONS_LEN
            ));
        }
    }
    Some(prompt)
}

/// Escape XML special characters to prevent injection into XML-like prompt tags.
pub(super) fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Check whether an exact catalog model supports vision.
///
/// The authoritative source is `models.json` (`capabilities.vision`). Unknown
/// Local/BYOK IDs fail closed instead of guessing from product-name prefixes;
/// callers must add verified capability metadata before sending images.
pub(super) fn model_likely_supports_vision(model: &str) -> bool {
    let canonical = models_config::get_canonicalized_id(model);
    models_config::get_all_model_entries()
        .get(&canonical)
        .is_some_and(|entry| entry.capabilities.vision)
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
    fn instruction_files_read_agents_first_and_nearest_directory_first() {
        let repo = tempfile::tempdir().unwrap();
        std::fs::create_dir(repo.path().join(".git")).unwrap();
        let package = repo.path().join("packages").join("app");
        std::fs::create_dir_all(package.join(".agi")).unwrap();
        std::fs::write(repo.path().join("AGENTS.md"), "root agents").unwrap();
        std::fs::write(package.join("CLAUDE.md"), "package claude").unwrap();
        std::fs::write(package.join("AGENTS.md"), "package agents").unwrap();
        std::fs::write(package.join(".agi/instructions.md"), "package agi").unwrap();

        let prompt = load_project_instructions(&package).unwrap();
        let position = |needle: &str| prompt.find(needle).unwrap();

        assert!(position("package agents") < position("package claude"));
        assert!(position("package claude") < position("package agi"));
        assert!(position("package agi") < position("root agents"));
        let package_label = package.join("AGENTS.md");
        let package_label = package_label.strip_prefix(repo.path()).unwrap().display();
        assert!(prompt.contains(&format!("#### {package_label}")));
        assert!(!prompt.contains("cut at"));
    }

    #[test]
    fn instruction_files_outside_a_repository_ignore_parents() {
        let parent = tempfile::tempdir().unwrap();
        let folder = parent.path().join("project");
        std::fs::create_dir(&folder).unwrap();
        std::fs::write(parent.path().join("AGENTS.md"), "unrelated parent").unwrap();

        assert!(load_project_instructions(&folder).is_none());

        std::fs::write(folder.join("AGENTS.md"), "own rules").unwrap();
        let prompt = load_project_instructions(&folder).unwrap();
        assert!(prompt.contains("own rules"));
        assert!(!prompt.contains("unrelated parent"));
    }

    #[test]
    fn instruction_files_are_capped_and_say_so() {
        let repo = tempfile::tempdir().unwrap();
        std::fs::create_dir(repo.path().join(".git")).unwrap();
        std::fs::write(
            repo.path().join("AGENTS.md"),
            "a".repeat(MAX_PROJECT_INSTRUCTIONS_LEN + 10),
        )
        .unwrap();
        std::fs::write(repo.path().join("CLAUDE.md"), "never reached").unwrap();

        let prompt = load_project_instructions(repo.path()).unwrap();
        assert!(!prompt.contains("never reached"));
        assert!(prompt.contains(&format!(
            "cut at {} characters",
            MAX_PROJECT_INSTRUCTIONS_LEN
        )));
    }

    #[test]
    fn user_instructions_put_the_conversation_before_global() {
        assert_eq!(
            build_user_instructions_prompt(None, Some("  "), Some("\n")),
            None
        );

        let prompt = build_user_instructions_prompt(
            Some("Answer in British English."),
            Some("Be brief."),
            None,
        )
        .unwrap();
        assert!(prompt.find("Be brief.").unwrap() < prompt.find("British English").unwrap());
        assert!(prompt.contains("### This conversation"));
        assert!(prompt.contains("### All conversations"));
        assert!(!prompt.contains("### Instructions file"));

        let global_only =
            build_user_instructions_prompt(Some("Use metric units."), None, None).unwrap();
        assert!(!global_only.contains("### This conversation"));
        assert!(global_only.contains("Use metric units."));
    }

    #[test]
    fn the_instructions_file_is_the_broadest_source_and_comes_last() {
        let prompt = build_user_instructions_prompt(
            Some("Answer in British English."),
            Some("Be brief."),
            Some("Prefer functional patterns."),
        )
        .unwrap();
        let conversation = prompt.find("Be brief.").unwrap();
        let global = prompt.find("British English").unwrap();
        let file = prompt.find("Prefer functional patterns.").unwrap();
        assert!(conversation < global && global < file);
        assert!(prompt.contains("### Instructions file (~/.agiworkforce/INSTRUCTIONS.md)"));
        assert!(prompt.contains("then the instructions file"));
        assert!(prompt.contains("Repository instruction files also win"));

        let file_only =
            build_user_instructions_prompt(None, None, Some("  Run tests after changes.\n"))
                .unwrap();
        assert!(file_only.ends_with("Run tests after changes."));
        assert!(!file_only.contains("### All conversations"));
    }

    #[test]
    fn an_oversized_instructions_file_is_cut_and_says_so() {
        let oversized = "界".repeat(MAX_PROJECT_INSTRUCTIONS_LEN + 10);
        let prompt = build_user_instructions_prompt(None, None, Some(&oversized)).unwrap();
        assert_eq!(prompt.matches('界').count(), MAX_PROJECT_INSTRUCTIONS_LEN);
        assert!(prompt.contains(&format!(
            "cut at {} characters",
            MAX_PROJECT_INSTRUCTIONS_LEN
        )));
    }

    #[test]
    fn escape_xml_escapes_special_characters() {
        assert_eq!(escape_xml("a & <b>"), "a &amp; &lt;b&gt;");
    }

    #[test]
    fn model_likely_supports_vision_uses_catalog_and_fails_closed() {
        let vision_model = models_config::get_all_model_entries()
            .values()
            .find(|entry| entry.capabilities.vision)
            .expect("catalog must contain a vision-capable model");
        let non_vision_model = models_config::get_all_model_entries()
            .values()
            .find(|entry| !entry.capabilities.vision)
            .expect("catalog must contain a model without vision");

        assert!(model_likely_supports_vision(&vision_model.id));
        assert!(!model_likely_supports_vision(&non_vision_model.id));
        assert!(!model_likely_supports_vision(
            "fixture-unknown-vision-model"
        ));
    }
}
