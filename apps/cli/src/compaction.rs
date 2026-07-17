//! CLI adapters around the shared agent context engine, plus project-specific
//! instruction discovery. Compaction mechanics live in
//! `agiworkforce_agent_core::context`; this module intentionally contains no
//! second pruning or token-accounting implementation.

use std::path::{Path, PathBuf};

use crate::models::Message;

const DEFAULT_CONTEXT_LIMIT: usize = 128_000;
const MAX_INSTRUCTION_TOKENS: usize = 10_000;

#[allow(dead_code)]
const ROOT_MARKERS: &[&str] = &[
    ".git",
    "Cargo.toml",
    "package.json",
    "go.mod",
    "pyproject.toml",
];

const INSTRUCTION_FILES: &[&str] = &["AGENTS.md", "CLAUDE.md", ".agiworkforce/instructions.md"];

/// Estimate text tokens using the shared code-point heuristic.
pub fn estimate_tokens(text: &str) -> usize {
    agiworkforce_agent_core::context::estimate_text_tokens(text)
}

/// Estimate one message using the shared accounting implementation.
pub fn message_tokens(message: &Message) -> usize {
    agiworkforce_agent_core::context::estimate_message_tokens(message)
}

pub fn context_limit(model: &str) -> usize {
    let limit = crate::model_catalog::context_window(model);
    if limit == 0 {
        DEFAULT_CONTEXT_LIMIT
    } else {
        limit
    }
}

#[derive(Debug, Clone)]
pub struct ContextUsage {
    pub used_tokens: usize,
    pub limit_tokens: usize,
    pub fraction: f64,
    pub near_limit: bool,
}

/// Compatibility view used by `/context` and session metadata. Runtime
/// compaction uses the richer provider-anchored budget directly.
pub fn context_usage(messages: &[Message], model: &str) -> ContextUsage {
    let limit_tokens = context_limit(model);
    let budget = agiworkforce_agent_core::context::context_budget(messages, limit_tokens, 0, None);
    ContextUsage {
        used_tokens: budget.used_tokens,
        limit_tokens,
        fraction: budget.used_fraction,
        near_limit: budget.near_limit(),
    }
}

pub fn format_context_report(usage: &ContextUsage) -> String {
    const BAR_WIDTH: usize = 30;
    let filled = ((usage.fraction * BAR_WIDTH as f64) as usize).min(BAR_WIDTH);
    let bar = format!("{}{}", "#".repeat(filled), " ".repeat(BAR_WIDTH - filled));
    format!(
        "Context: [{bar}] {pct:.0}%  ({used}K / {limit}K tokens)",
        pct = usage.fraction * 100.0,
        used = usage.used_tokens / 1_000,
        limit = usage.limit_tokens / 1_000,
    )
}

/// Find the project root by walking upward to the first known root marker.
#[allow(dead_code)]
pub fn find_project_root(start: &Path) -> Option<PathBuf> {
    let mut current = start.to_path_buf();
    loop {
        if ROOT_MARKERS
            .iter()
            .any(|marker| current.join(marker).exists())
        {
            return Some(current);
        }
        match current.parent() {
            Some(parent) if parent != current => current = parent.to_path_buf(),
            _ => return None,
        }
    }
}

/// Load `AGENTS.md`, `CLAUDE.md`, and AGI instruction files root-first from
/// the filesystem hierarchy, stopping at the shared 10K-token budget.
pub fn load_instructions(cwd: &Path) -> Option<String> {
    let dirs = walk_to_root(cwd);
    let mut segments = Vec::new();
    let mut total = 0usize;

    for dir in dirs.iter().rev() {
        for name in INSTRUCTION_FILES {
            let path = dir.join(name);
            let content = match std::fs::read_to_string(&path) {
                Ok(content) => content,
                Err(_) => continue,
            };
            let tokens = estimate_tokens(&content);
            if total + tokens > MAX_INSTRUCTION_TOKENS {
                break;
            }
            total += tokens;
            segments.push(format!(
                "<!-- Instructions from: {} -->\n{}",
                path.display(),
                content.trim()
            ));
        }
    }

    (!segments.is_empty()).then(|| segments.join("\n\n"))
}

fn walk_to_root(start: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let mut current = start.to_path_buf();
    loop {
        dirs.push(current.clone());
        match current.parent() {
            Some(parent) if parent != current => current = parent.to_path_buf(),
            _ => break,
        }
    }
    dirs
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn token_estimation_delegates_to_shared_engine() {
        assert_eq!(estimate_tokens("abcde"), 2);
        assert_eq!(
            message_tokens(&Message::text("user", "hello")),
            agiworkforce_agent_core::context::estimate_message_tokens(&Message::text(
                "user", "hello"
            ))
        );
    }

    #[test]
    fn context_usage_uses_catalog_limit() {
        let usage = context_usage(&[Message::text("user", "x".repeat(400))], "unknown-model");
        assert_eq!(usage.used_tokens, 104);
        assert!(usage.limit_tokens > usage.used_tokens);
        assert!(!usage.near_limit);
    }

    #[test]
    fn project_root_walks_up_to_marker() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::create_dir(dir.path().join(".git")).expect("git marker");
        let child = dir.path().join("src/deep");
        fs::create_dir_all(&child).expect("child");
        assert_eq!(find_project_root(&child).as_deref(), Some(dir.path()));
    }

    #[test]
    fn instruction_files_load_root_first() {
        let dir = tempfile::tempdir().expect("tempdir");
        let child = dir.path().join("src");
        fs::create_dir_all(&child).expect("child");
        fs::write(dir.path().join("AGENTS.md"), "root rule").expect("root instructions");
        fs::write(child.join("AGENTS.md"), "child rule").expect("child instructions");

        let instructions = load_instructions(&child).expect("instructions");
        assert!(instructions.find("root rule") < instructions.find("child rule"));
    }
}
