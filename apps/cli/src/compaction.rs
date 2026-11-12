//! CLI adapters around the shared agent context engine, plus project-specific
//! instruction discovery. Compaction mechanics live in
//! `agiworkforce_agent_core::context`; this module intentionally contains no
//! second pruning or token-accounting implementation.

use std::path::{Path, PathBuf};

use crate::models::Message;

const DEFAULT_CONTEXT_LIMIT: usize = 128_000;
const MAX_INSTRUCTION_TOKENS: usize = 10_000;

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

/// What `/context` and the status line report: the same provider-anchored
/// budget compaction acts on, measured against the input the model can take
/// once the reply is reserved.
pub fn context_usage(
    messages: &[Message],
    model: &str,
    reserved_output_tokens: usize,
    usage_anchor: Option<agiworkforce_agent_core::context::ContextUsageAnchor>,
) -> ContextUsage {
    let budget = agiworkforce_agent_core::context::context_budget(
        messages,
        context_limit(model),
        reserved_output_tokens,
        usage_anchor,
    );
    ContextUsage {
        used_tokens: budget.used_tokens,
        limit_tokens: budget.usable_input_tokens,
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

/// Compact only `messages[keep..]`. Everything before `keep` is returned
/// exactly as it was, so a checkpoint taken there still matches the
/// conversation, and the budgets describe the whole result.
pub async fn compact_after(
    messages: &[Message],
    keep: usize,
    config: &agiworkforce_agent_core::context::ContextCompactionConfig,
    summarizer: Option<&dyn agiworkforce_agent_core::context::ContextSummarizer>,
) -> agiworkforce_agent_core::context::ContextCompactionResult {
    use agiworkforce_agent_core::context::{compact_context, context_budget};

    let keep = keep.min(messages.len());
    let tail = compact_context(&messages[keep..], config, None, summarizer).await;
    let mut combined = messages[..keep].to_vec();
    combined.extend(tail.messages);
    let window = config.context_window_tokens;
    let reserved = config.reserved_output_tokens;
    agiworkforce_agent_core::context::ContextCompactionResult {
        before: context_budget(messages, window, reserved, None),
        after: context_budget(&combined, window, reserved, None),
        messages: combined,
        ..tail
    }
}

pub fn compaction_receipt(
    result: &agiworkforce_agent_core::context::ContextCompactionResult,
) -> String {
    let percent = (result.after.used_fraction * 100.0) as u32;
    let sizes = format!(
        "~{} -> ~{} tokens ({percent}% of limit)",
        result.before.used_tokens, result.after.used_tokens
    );
    if !result.compacted {
        format!(
            "Nothing to compact: no earlier turn could be summarized, so the context stays at ~{} tokens ({percent}% of limit)",
            result.after.used_tokens
        )
    } else if result.messages_compacted == 0 {
        format!("Trimmed long tool output: {sizes}")
    } else {
        format!(
            "Compacted {} earlier messages: {sizes}",
            result.messages_compacted
        )
    }
}

/// Find the project root by walking upward to the first known root marker.
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

/// One instruction file that a turn in a given directory actually loads.
#[derive(Debug, Clone)]
pub struct InstructionSource {
    pub path: PathBuf,
    /// Directory the file was discovered in.
    pub dir: PathBuf,
    pub content: String,
}

/// The instruction files a turn in `cwd` loads, root-first, already truncated
/// to the shared budget.
///
/// [`load_instructions`] is built from this, so a client preview and the turn
/// itself can never disagree about which files were read.
///
/// Each file is repository content that goes into the system prompt, so it is
/// read through [`crate::project_text`]: only where it is a regular file
/// inside the folder it was found in, once its links are followed, and never
/// a credential file. A link out of that folder, a FIFO or an oversized file
/// is skipped, and the log says which and why.
pub fn instruction_sources(cwd: &Path) -> (Vec<InstructionSource>, bool) {
    let dirs = walk_to_root(cwd);
    let mut sources = Vec::new();
    let mut truncated = false;
    let mut total = 0usize;

    if let Some((path, content)) = global_instructions() {
        let content = if estimate_tokens(&content) <= MAX_INSTRUCTION_TOKENS {
            content
        } else {
            truncated = true;
            trim_to_tokens(&content, MAX_INSTRUCTION_TOKENS / 2)
        };
        total += estimate_tokens(&content);
        sources.push(InstructionSource {
            dir: path.parent().map(Path::to_path_buf).unwrap_or_default(),
            path,
            content,
        });
    }

    for dir in dirs.iter().rev() {
        for name in INSTRUCTION_FILES {
            let path = dir.join(name);
            if sources.iter().any(|source| same_file(&source.path, &path)) {
                continue;
            }
            let Some(content) = crate::project_text::read_within(dir, &path) else {
                continue;
            };
            let tokens = estimate_tokens(&content);
            if total + tokens > MAX_INSTRUCTION_TOKENS {
                truncated = true;
                break;
            }
            total += tokens;
            sources.push(InstructionSource {
                path,
                dir: dir.clone(),
                content,
            });
        }
    }

    (sources, truncated)
}

#[cfg(test)]
thread_local! {
    static TEST_CONFIG_HOME: std::cell::RefCell<Option<PathBuf>> =
        const { std::cell::RefCell::new(None) };
}

#[cfg(test)]
pub(crate) fn with_config_home<T>(home: &Path, run: impl FnOnce() -> T) -> T {
    let previous = TEST_CONFIG_HOME.with(|cell| cell.replace(Some(home.to_path_buf())));
    let result = run();
    TEST_CONFIG_HOME.with(|cell| cell.replace(previous));
    result
}

pub(crate) fn config_home() -> Option<PathBuf> {
    #[cfg(test)]
    if let Some(home) = TEST_CONFIG_HOME.with(|cell| cell.borrow().clone()) {
        return Some(home);
    }
    crate::config::CliConfig::config_dir().ok()
}

fn global_instructions() -> Option<(std::path::PathBuf, String)> {
    let home = config_home()?;
    ["instructions.md", "INSTRUCTIONS.md"]
        .iter()
        .map(|name| home.join(name))
        .find_map(|path| {
            std::fs::read_to_string(&path)
                .ok()
                .filter(|content| !content.trim().is_empty())
                .map(|content| (path, content))
        })
}

fn trim_to_tokens(content: &str, budget: usize) -> String {
    let chars = content.chars().count();
    let mut keep = chars.saturating_mul(budget) / estimate_tokens(content).max(1);
    let mut trimmed: String = content.chars().take(keep).collect();
    while keep > 0 && estimate_tokens(&trimmed) > budget {
        keep -= 1;
        trimmed = content.chars().take(keep).collect();
    }
    match trimmed.rfind('\n') {
        Some(end) if end > 0 => trimmed[..end].to_string(),
        _ => trimmed,
    }
}

fn report_truncated_instructions() {
    static REPORTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if !REPORTED.swap(true, std::sync::atomic::Ordering::Relaxed) {
        eprintln!(
            "note: your instruction files are over the {MAX_INSTRUCTION_TOKENS}-token budget, so some of them were cut or left out; shorten them to load all of them."
        );
    }
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

/// Load `AGENTS.md`, `CLAUDE.md`, and AGI instruction files root-first from
/// the filesystem hierarchy, stopping at the shared 10K-token budget.
pub fn load_instructions(cwd: &Path) -> Option<String> {
    let (sources, truncated) = instruction_sources(cwd);
    if truncated {
        report_truncated_instructions();
    }
    let segments: Vec<String> = sources
        .iter()
        .map(|source| {
            format!(
                "<!-- Instructions from: {} -->\n{}",
                source.path.display(),
                source.content.trim()
            )
        })
        .collect();

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

    fn receipt_fixture(
        compacted: bool,
        messages_compacted: usize,
    ) -> agiworkforce_agent_core::context::ContextCompactionResult {
        use agiworkforce_agent_core::context::{context_budget, SummarySource};

        let messages = vec![Message::text("user", "x".repeat(8_000))];
        let budget = context_budget(&messages, 10_000, 1_000, None);
        agiworkforce_agent_core::context::ContextCompactionResult {
            messages,
            compacted,
            messages_compacted,
            before: budget.clone(),
            after: budget,
            summary_source: SummarySource::None,
            stages: Vec::new(),
        }
    }

    #[test]
    fn a_compaction_that_changed_nothing_says_so() {
        let receipt = compaction_receipt(&receipt_fixture(false, 0));
        assert!(receipt.starts_with("Nothing to compact"), "{receipt}");
        assert!(!receipt.contains("->"), "{receipt}");
    }

    #[test]
    fn a_compaction_that_only_pruned_tool_output_says_so() {
        let receipt = compaction_receipt(&receipt_fixture(true, 0));
        assert!(receipt.starts_with("Trimmed long tool output"), "{receipt}");
    }

    #[test]
    fn a_compaction_that_summarized_reports_how_many_messages() {
        let receipt = compaction_receipt(&receipt_fixture(true, 12));
        assert!(
            receipt.starts_with("Compacted 12 earlier messages"),
            "{receipt}"
        );
    }

    #[tokio::test]
    async fn the_engine_result_for_a_single_exchange_is_reported_as_nothing_to_compact() {
        use agiworkforce_agent_core::context::{compact_context, ContextCompactionConfig};

        let history = vec![
            Message::text("system", "trusted system policy"),
            Message::text("user", "a long ask ".repeat(400)),
            Message::text("assistant", "a long answer ".repeat(400)),
        ];
        let config = ContextCompactionConfig {
            compaction_fraction: 0.0,
            ..ContextCompactionConfig::default()
        };

        let result = compact_context(&history, &config, None, None).await;

        assert!(compaction_receipt(&result).starts_with("Nothing to compact"));
    }

    #[test]
    fn context_usage_uses_catalog_limit() {
        let usage = context_usage(
            &[Message::text("user", "x".repeat(400))],
            "unknown-model",
            0,
            None,
        );
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

    #[test]
    fn an_oversized_global_instructions_file_is_trimmed_to_the_budget_not_dropped() {
        let home = tempfile::tempdir().expect("home");
        let cwd = tempfile::tempdir().expect("cwd");
        let line = "Always run the formatter before you finish.\n";
        let oversized = line.repeat(MAX_INSTRUCTION_TOKENS * 2);
        assert!(estimate_tokens(&oversized) > MAX_INSTRUCTION_TOKENS);
        fs::write(home.path().join("instructions.md"), &oversized).expect("global instructions");

        let (sources, truncated) =
            with_config_home(home.path(), || instruction_sources(cwd.path()));
        let global = sources
            .iter()
            .find(|source| source.path == home.path().join("instructions.md"))
            .expect("the global file still loads");

        assert!(truncated);
        assert!(global.content.starts_with("Always run the formatter"));
        assert!(estimate_tokens(&global.content) <= MAX_INSTRUCTION_TOKENS / 2);
    }

    #[test]
    fn an_oversized_global_instructions_file_leaves_room_for_the_repository() {
        let home = tempfile::tempdir().expect("home");
        let cwd = tempfile::tempdir().expect("cwd");
        let oversized =
            "Always run the formatter before you finish.\n".repeat(MAX_INSTRUCTION_TOKENS * 2);
        fs::write(home.path().join("instructions.md"), &oversized).expect("global instructions");
        fs::write(cwd.path().join("AGENTS.md"), "Use the house style.").expect("repository file");

        let (sources, truncated) =
            with_config_home(home.path(), || instruction_sources(cwd.path()));

        assert!(truncated);
        assert!(sources
            .iter()
            .any(|source| source.content == "Use the house style."));
    }

    #[cfg(unix)]
    #[test]
    fn an_instruction_file_that_leads_out_of_its_folder_is_not_sent_to_the_model() {
        let dir = tempfile::tempdir().expect("tempdir");
        let outside = tempfile::tempdir().expect("outside");
        fs::write(outside.path().join("credentials"), "not for the prompt").expect("outside file");
        std::os::unix::fs::symlink(
            outside.path().join("credentials"),
            dir.path().join("AGENTS.md"),
        )
        .expect("link out");
        fs::write(dir.path().join("house-rules.md"), "house rules").expect("real file");
        std::os::unix::fs::symlink("house-rules.md", dir.path().join("CLAUDE.md"))
            .expect("link in");

        let (sources, _) = instruction_sources(dir.path());
        let loaded: Vec<&str> = sources
            .iter()
            .filter(|source| source.dir == dir.path())
            .map(|source| source.content.as_str())
            .collect();

        assert_eq!(
            loaded,
            ["house rules"],
            "a link out of the folder was loaded, or a link inside it was not"
        );
    }
}
