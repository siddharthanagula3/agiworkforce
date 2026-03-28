use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Memory tier
// ---------------------------------------------------------------------------

/// Which tier a memory entry belongs to.
///
/// Tiers are resolved in priority order: Global (lowest) -> Project -> Local
/// (highest). When building the system prompt, all tiers are concatenated
/// with headers so the LLM sees global defaults first and local overrides
/// last.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum MemoryTier {
    /// `~/.agi/CLAUDE.md` — user-wide defaults.
    Global,
    /// `<project_root>/CLAUDE.md` — project-level instructions.
    Project,
    /// `<cwd>/CLAUDE.md` — directory-local overrides (only when cwd differs
    /// from the project root).
    Local,
}

impl fmt::Display for MemoryTier {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MemoryTier::Global => write!(f, "Global"),
            MemoryTier::Project => write!(f, "Project"),
            MemoryTier::Local => write!(f, "Local"),
        }
    }
}

// ---------------------------------------------------------------------------
// Memory entry
// ---------------------------------------------------------------------------

/// A single loaded memory file with its contents and provenance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub content: String,
    pub source: MemoryTier,
    pub file_path: PathBuf,
}

// ---------------------------------------------------------------------------
// Memory manager
// ---------------------------------------------------------------------------

/// Discovers and loads hierarchical memory files (CLAUDE.md) from three tiers.
pub struct MemoryManager {
    /// `~/.agi/CLAUDE.md`
    global_path: PathBuf,
    /// `<project_root>/CLAUDE.md` (None when no project root found)
    project_path: Option<PathBuf>,
    /// `<cwd>/CLAUDE.md` when cwd != project root (None otherwise)
    local_path: Option<PathBuf>,
}

impl MemoryManager {
    /// Create a new `MemoryManager` by discovering memory files at each tier.
    ///
    /// - **Global**: `~/.agi/CLAUDE.md`
    /// - **Project**: Walk up from `cwd` to find a project root (`.git`,
    ///   `Cargo.toml`, `package.json`, etc.) and use `<root>/CLAUDE.md`.
    /// - **Local**: `<cwd>/CLAUDE.md` only when cwd differs from the project
    ///   root (avoids double-loading).
    pub fn new(cwd: &Path) -> Self {
        // Global
        let global_path = dirs::home_dir()
            .or_else(|| std::env::var("HOME").ok().map(PathBuf::from))
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".agi")
            .join("CLAUDE.md");

        // Project — reuse the existing project-root discovery
        let project_root = find_git_root(cwd);
        let project_path = project_root.as_ref().map(|root| root.join("CLAUDE.md"));

        // Local — only set if cwd != project root to avoid duplication.
        let local_path = {
            let cwd_canon = cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf());
            let is_same_as_project = project_root.as_ref().is_some_and(|root| {
                let root_canon = root.canonicalize().unwrap_or_else(|_| root.clone());
                cwd_canon == root_canon
            });
            if is_same_as_project {
                None
            } else {
                let candidate = cwd.join("CLAUDE.md");
                // Also skip if the local path equals the project path (edge case)
                let already_covered = project_path.as_ref().is_some_and(|pp| {
                    let pp_canon = pp.canonicalize().unwrap_or_else(|_| pp.clone());
                    let cc_canon = candidate
                        .canonicalize()
                        .unwrap_or_else(|_| candidate.clone());
                    pp_canon == cc_canon
                });
                if already_covered {
                    None
                } else {
                    Some(candidate)
                }
            }
        };

        Self {
            global_path,
            project_path,
            local_path,
        }
    }

    /// Load all memory entries that exist on disk, ordered Global -> Project
    /// -> Local.
    pub fn load_all(&self) -> Vec<MemoryEntry> {
        let mut entries = Vec::new();

        if let Some(content) = read_if_exists(&self.global_path) {
            entries.push(MemoryEntry {
                content,
                source: MemoryTier::Global,
                file_path: self.global_path.clone(),
            });
        }

        if let Some(ref pp) = self.project_path {
            if let Some(content) = read_if_exists(pp) {
                entries.push(MemoryEntry {
                    content,
                    source: MemoryTier::Project,
                    file_path: pp.clone(),
                });
            }
        }

        if let Some(ref lp) = self.local_path {
            if let Some(content) = read_if_exists(lp) {
                entries.push(MemoryEntry {
                    content,
                    source: MemoryTier::Local,
                    file_path: lp.clone(),
                });
            }
        }

        entries
    }

    /// Build a combined system prompt section from all memory tiers.
    ///
    /// Returns an empty string if no memory files exist.
    pub fn get_context_prompt(&self) -> String {
        let entries = self.load_all();
        if entries.is_empty() {
            return String::new();
        }

        let mut prompt = String::from("<memory-hierarchy>\n");
        for entry in &entries {
            prompt.push_str(&format!(
                "\n## {} Memory ({})\n\n{}\n",
                entry.source,
                entry.file_path.display(),
                entry.content.trim(),
            ));
        }
        prompt.push_str("\n</memory-hierarchy>");
        prompt
    }

    /// Save (append) content to the specified tier's memory file.
    ///
    /// Creates parent directories and the file itself if they don't exist.
    pub fn save(&self, tier: &MemoryTier, content: &str) -> Result<PathBuf, String> {
        let path = match tier {
            MemoryTier::Global => self.global_path.clone(),
            MemoryTier::Project => self.project_path.clone().ok_or_else(|| {
                "No project root found. Run from a project directory or use /init.".to_string()
            })?,
            MemoryTier::Local => self.local_path.clone().unwrap_or_else(|| {
                // Fallback: if local_path is None because cwd==project root,
                // save to the project CLAUDE.md instead.
                self.project_path
                    .clone()
                    .unwrap_or_else(|| PathBuf::from("CLAUDE.md"))
            }),
        };

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    format!("Failed to create directory {}: {}", parent.display(), e)
                })?;
            }
        }

        // Append to the file
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| format!("Failed to open {}: {}", path.display(), e))?;

        writeln!(file, "\n{}", content)
            .map_err(|e| format!("Failed to write to {}: {}", path.display(), e))?;

        Ok(path)
    }

    /// List all memory file locations with their existence status.
    ///
    /// Returns `(tier, path, exists)` tuples for all three tiers.
    pub fn list(&self) -> Vec<(MemoryTier, PathBuf, bool)> {
        let mut result = vec![(
            MemoryTier::Global,
            self.global_path.clone(),
            self.global_path.exists(),
        )];

        if let Some(ref pp) = self.project_path {
            result.push((MemoryTier::Project, pp.clone(), pp.exists()));
        } else {
            result.push((
                MemoryTier::Project,
                PathBuf::from("<no project root found>"),
                false,
            ));
        }

        if let Some(ref lp) = self.local_path {
            result.push((MemoryTier::Local, lp.clone(), lp.exists()));
        } else {
            result.push((
                MemoryTier::Local,
                PathBuf::from("<cwd is project root>"),
                false,
            ));
        }

        result
    }

    /// Get the path for a specific tier.
    pub fn path_for_tier(&self, tier: &MemoryTier) -> Option<&Path> {
        match tier {
            MemoryTier::Global => Some(&self.global_path),
            MemoryTier::Project => self.project_path.as_deref(),
            MemoryTier::Local => self.local_path.as_deref(),
        }
    }
}

// ---------------------------------------------------------------------------
// Glob-matched rules (.agiworkforce/rules/*.md)
// ---------------------------------------------------------------------------

/// A rule loaded from a `.md` file with optional YAML frontmatter `globs`.
#[derive(Debug, Clone)]
pub struct Rule {
    /// Glob patterns from YAML frontmatter (empty = always active).
    pub globs: Vec<String>,
    /// Markdown body content (without frontmatter).
    pub body: String,
    /// Source file path.
    pub source: PathBuf,
}

/// Loads rules from `.agiworkforce/rules/` (project) and `~/.agiworkforce/rules/`.
///
/// Each `.md` file may have YAML frontmatter with a `globs` field:
/// ```yaml
/// ---
/// globs: ["*.rs", "src/**/*.ts"]
/// ---
/// Always use error handling in Rust files.
/// ```
///
/// Rules without a `globs` field are always included.
pub fn load_rules(cwd: &Path) -> Vec<Rule> {
    let mut rules = Vec::new();

    // Project-level rules
    let project_root = find_git_root(cwd);
    if let Some(ref root) = project_root {
        load_rules_from_dir(&root.join(".agiworkforce").join("rules"), &mut rules);
    }

    // Global rules (only .md files, skip .rules which are exec-policy files)
    if let Some(home) = dirs::home_dir() {
        load_rules_from_dir(&home.join(".agiworkforce").join("rules"), &mut rules);
    }

    rules
}

/// Scan a directory for `.md` rule files and parse each one.
fn load_rules_from_dir(dir: &Path, rules: &mut Vec<Rule>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Some(rule) = parse_rule_file(&path) {
                rules.push(rule);
            }
        }
    }
}

/// Parse a single `.md` rule file, extracting YAML frontmatter globs.
fn parse_rule_file(path: &Path) -> Option<Rule> {
    let content = std::fs::read_to_string(path).ok()?;
    if content.trim().is_empty() {
        return None;
    }

    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        // No frontmatter — rule always applies
        return Some(Rule {
            globs: Vec::new(),
            body: content,
            source: path.to_path_buf(),
        });
    }

    let after_first = trimmed[3..].trim_start_matches('\n');
    let end_pos = after_first.find("\n---")?;
    let frontmatter_str = &after_first[..end_pos];
    let body = after_first[end_pos + 4..]
        .trim_start_matches('\n')
        .to_string();

    if body.trim().is_empty() {
        return None;
    }

    let globs = parse_globs_field(frontmatter_str);
    Some(Rule {
        globs,
        body,
        source: path.to_path_buf(),
    })
}

/// Extract the `globs` field from YAML frontmatter.
///
/// Supports both inline array (`globs: ["*.rs", "*.ts"]`) and multi-line:
/// ```yaml
/// globs:
///   - "*.rs"
///   - "*.ts"
/// ```
fn parse_globs_field(frontmatter: &str) -> Vec<String> {
    let mut globs = Vec::new();
    let mut in_globs_list = false;

    for line in frontmatter.lines() {
        let trimmed = line.trim();
        if let Some(val) = trimmed.strip_prefix("globs:") {
            let val = val.trim();
            if val.starts_with('[') {
                // Inline array: globs: ["*.rs", "*.ts"]
                let inner = val.trim_start_matches('[').trim_end_matches(']');
                for item in inner.split(',') {
                    let g = item.trim().trim_matches('"').trim_matches('\'').to_string();
                    if !g.is_empty() {
                        globs.push(g);
                    }
                }
                return globs;
            }
            // Multi-line list follows
            in_globs_list = true;
            continue;
        }
        if in_globs_list {
            if let Some(item) = trimmed.strip_prefix("- ") {
                let g = item.trim().trim_matches('"').trim_matches('\'').to_string();
                if !g.is_empty() {
                    globs.push(g);
                }
            } else if !trimmed.is_empty() {
                // End of list (new key)
                break;
            }
        }
    }

    globs
}

/// Filter rules that match any of the given file paths using glob patterns.
///
/// Rules with no globs are always included. Returns the combined prompt text.
pub fn rules_context_prompt(rules: &[Rule], active_files: &[&str]) -> String {
    let matched: Vec<&Rule> = rules
        .iter()
        .filter(|rule| {
            if rule.globs.is_empty() {
                return true; // No globs = always active
            }
            rule.globs.iter().any(|pattern| {
                let glob_pat = glob::Pattern::new(pattern).ok();
                glob_pat.is_some_and(|pat| {
                    active_files.iter().any(|f| {
                        let p = Path::new(f);
                        // Match against full path and just the filename
                        pat.matches_path(p)
                            || p.file_name()
                                .and_then(|n| n.to_str())
                                .is_some_and(|n| pat.matches(n))
                    })
                })
            })
        })
        .collect();

    if matched.is_empty() {
        return String::new();
    }

    let mut prompt = String::from("<rules>\n");
    for rule in &matched {
        prompt.push_str(&format!(
            "\n## Rule ({})\n\n{}\n",
            rule.source.display(),
            rule.body.trim(),
        ));
    }
    prompt.push_str("\n</rules>");
    prompt
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Read a file's contents if it exists and is readable.
fn read_if_exists(path: &Path) -> Option<String> {
    if !path.exists() {
        return None;
    }
    match std::fs::read_to_string(path) {
        Ok(s) if s.trim().is_empty() => None,
        Ok(s) => Some(s),
        Err(_) => None,
    }
}

/// Find the git root by running `git rev-parse --show-toplevel`.
///
/// Falls back to walking up looking for `.git` if git is unavailable.
fn find_git_root(start: &Path) -> Option<PathBuf> {
    // Try git command first (most accurate)
    let output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(start)
        .output()
        .ok();

    if let Some(out) = output {
        if out.status.success() {
            let root = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !root.is_empty() {
                return Some(PathBuf::from(root));
            }
        }
    }

    // Fallback: walk up looking for root markers
    let markers = [
        ".git",
        "Cargo.toml",
        "package.json",
        "go.mod",
        "pyproject.toml",
    ];
    let mut current = start.to_path_buf();
    loop {
        for marker in &markers {
            if current.join(marker).exists() {
                return Some(current);
            }
        }
        match current.parent() {
            Some(parent) if parent != current => current = parent.to_path_buf(),
            _ => return None,
        }
    }
}

/// Format a content preview (first N lines, truncated).
pub fn content_preview(content: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = content.lines().take(max_lines + 1).collect();
    if lines.len() > max_lines {
        let preview: Vec<&str> = lines[..max_lines].to_vec();
        format!(
            "{}\n  ... ({} more lines)",
            preview.join("\n"),
            content.lines().count() - max_lines
        )
    } else {
        lines.join("\n")
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Helper: create a temp dir, returning its canonical path.
    fn tmp_dir() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().expect("create tempdir");
        let path = dir.path().canonicalize().expect("canonicalize");
        (dir, path)
    }

    #[test]
    fn test_memory_tier_display() {
        assert_eq!(format!("{}", MemoryTier::Global), "Global");
        assert_eq!(format!("{}", MemoryTier::Project), "Project");
        assert_eq!(format!("{}", MemoryTier::Local), "Local");
    }

    #[test]
    fn test_read_if_exists_missing_file() {
        assert!(read_if_exists(Path::new("/nonexistent/path/CLAUDE.md")).is_none());
    }

    #[test]
    fn test_read_if_exists_empty_file() {
        let (_d, path) = tmp_dir();
        let file = path.join("CLAUDE.md");
        fs::write(&file, "   \n  ").unwrap();
        assert!(read_if_exists(&file).is_none());
    }

    #[test]
    fn test_read_if_exists_with_content() {
        let (_d, path) = tmp_dir();
        let file = path.join("CLAUDE.md");
        fs::write(&file, "# Project Instructions").unwrap();
        let content = read_if_exists(&file);
        assert!(content.is_some());
        assert!(content.unwrap().contains("Project Instructions"));
    }

    #[test]
    fn test_content_preview_short() {
        let content = "line 1\nline 2\nline 3";
        let preview = content_preview(content, 5);
        assert_eq!(preview, "line 1\nline 2\nline 3");
    }

    #[test]
    fn test_content_preview_truncated() {
        let content = "line 1\nline 2\nline 3\nline 4\nline 5\nline 6";
        let preview = content_preview(content, 3);
        assert!(preview.contains("line 1"));
        assert!(preview.contains("line 2"));
        assert!(preview.contains("line 3"));
        assert!(preview.contains("3 more lines"));
    }

    #[test]
    fn test_memory_manager_load_all_empty() {
        let (_d, path) = tmp_dir();
        let mgr = MemoryManager::new(&path);
        let entries = mgr.load_all();
        // No CLAUDE.md files in temp dir, global may or may not exist
        // Just verify it doesn't panic
        for entry in &entries {
            assert!(!entry.content.trim().is_empty());
        }
    }

    #[test]
    fn test_memory_manager_list() {
        let (_d, path) = tmp_dir();
        let mgr = MemoryManager::new(&path);
        let list = mgr.list();
        assert_eq!(list.len(), 3); // always 3 tiers
        assert_eq!(list[0].0, MemoryTier::Global);
        assert_eq!(list[1].0, MemoryTier::Project);
        assert_eq!(list[2].0, MemoryTier::Local);
    }

    #[test]
    fn test_memory_manager_save_and_load() {
        let (_d, path) = tmp_dir();
        // Create a .git marker so the dir is treated as project root
        fs::create_dir_all(path.join(".git")).unwrap();

        let mgr = MemoryManager::new(&path);
        let saved = mgr.save(&MemoryTier::Project, "test instruction");
        assert!(saved.is_ok());

        let entries = mgr.load_all();
        let project_entries: Vec<&MemoryEntry> = entries
            .iter()
            .filter(|e| e.source == MemoryTier::Project)
            .collect();
        assert_eq!(project_entries.len(), 1);
        assert!(project_entries[0].content.contains("test instruction"));
    }

    #[test]
    fn test_get_context_prompt_empty() {
        let (_d, path) = tmp_dir();
        let mgr = MemoryManager::new(&path);
        // Filter out global if it happens to exist on the test machine
        let prompt = mgr.get_context_prompt();
        // The prompt should be empty or contain content from user's real global
        // This is fine — just verify no panic.
        let _ = prompt;
    }

    #[test]
    fn test_get_context_prompt_with_content() {
        let (_d, path) = tmp_dir();
        fs::create_dir_all(path.join(".git")).unwrap();
        fs::write(path.join("CLAUDE.md"), "# My Project\nBuild with cargo.").unwrap();

        let mgr = MemoryManager::new(&path);
        let prompt = mgr.get_context_prompt();
        assert!(prompt.contains("<memory-hierarchy>"));
        assert!(prompt.contains("## Project Memory"));
        assert!(prompt.contains("My Project"));
        assert!(prompt.contains("</memory-hierarchy>"));
    }

    #[test]
    fn test_save_creates_parent_dirs() {
        let (_d, path) = tmp_dir();
        let mgr = MemoryManager {
            global_path: path.join("subdir").join("deep").join("CLAUDE.md"),
            project_path: None,
            local_path: None,
        };

        let result = mgr.save(&MemoryTier::Global, "hello");
        assert!(result.is_ok());
        let saved_path = result.unwrap();
        assert!(saved_path.exists());
        let content = fs::read_to_string(saved_path).unwrap();
        assert!(content.contains("hello"));
    }

    #[test]
    fn test_no_local_when_cwd_is_project_root() {
        let (_d, path) = tmp_dir();
        fs::create_dir_all(path.join(".git")).unwrap();

        let mgr = MemoryManager::new(&path);
        // local_path should be None since cwd == project root
        assert!(mgr.local_path.is_none());
    }

    #[test]
    fn test_local_when_cwd_is_subdir() {
        let (_d, path) = tmp_dir();
        fs::create_dir_all(path.join(".git")).unwrap();
        let subdir = path.join("src").join("lib");
        fs::create_dir_all(&subdir).unwrap();

        let mgr = MemoryManager::new(&subdir);
        // local_path should be set since cwd != project root
        assert!(mgr.local_path.is_some());
        assert!(mgr.local_path.as_ref().unwrap().ends_with("CLAUDE.md"));
    }
}
