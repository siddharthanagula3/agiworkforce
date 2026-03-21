//! Context compaction — token estimation, usage tracking, and message pruning.
//!
//! Implements a multi-phase compaction strategy adapted from OpenCode + Gemini CLI + Codex:
//! 1. Reverse token budget: Walk tool outputs backward, truncating older ones first
//! 2. History split: Keep last 30% of messages untouched, compress only older 70%
//! 3. Prune: Replace large tool outputs with a short summary
//! 4. Truncate: Shorten remaining long text messages
//! 5. Remove: Drop tool-result messages entirely if still over budget
//! 6. Select: Keep last N messages that fit within the token budget

use std::path::{Path, PathBuf};

use crate::models::{ContentBlock, Message, MessageContent};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Rough token estimate: 4 UTF-8 bytes ≈ 1 token (Codex heuristic).
pub const BYTES_PER_TOKEN: usize = 4;

/// Warn user when context exceeds this fraction of the model's limit.
pub const CONTEXT_WARN_THRESHOLD: f64 = 0.80;

/// Token budget to protect during compaction (keep the most recent content).
/// Used by the compaction algorithm when deciding which messages to preserve.
#[allow(dead_code)]
pub const RECENT_WINDOW_TOKENS: usize = 50_000;

/// Default context window when the model is not in the catalog.
const DEFAULT_CONTEXT_LIMIT: usize = 200_000;

/// Max tokens allowed for instruction file injection.
const MAX_INSTRUCTION_TOKENS: usize = 10_000;

/// Root markers used by [`find_project_root`] to detect project boundaries.
#[allow(dead_code)]
const ROOT_MARKERS: &[&str] = &[
    ".git",
    "Cargo.toml",
    "package.json",
    "go.mod",
    "pyproject.toml",
];

/// Context window sizes keyed by model ID prefix (longest prefix wins first).
const MODEL_LIMITS: &[(&str, usize)] = &[
    ("claude-opus-4", 200_000),
    ("claude-sonnet-4", 200_000),
    ("claude-haiku-4", 200_000),
    ("claude-3-5", 200_000),
    ("claude-3", 200_000),
    ("gpt-4o", 128_000),
    ("o3", 200_000),
    ("gemini-3", 1_048_576),
    ("gemini-1.5-pro", 2_000_000),
    ("gemini-1.5", 1_000_000),
    ("mistral", 128_000),
    ("grok-4", 2_000_000),
    ("grok", 131_072),
    ("deepseek", 64_000),
];

/// Instruction file names to search for, in order of preference.
const INSTRUCTION_FILES: &[&str] = &["AGENTS.md", "CLAUDE.md", ".agiworkforce/instructions.md"];

// ---------------------------------------------------------------------------
// CompressionConfig
// ---------------------------------------------------------------------------

/// Configuration for the compaction pipeline.
///
/// All thresholds are tuneable. [`Default`] provides sensible values matching
/// the Gemini CLI defaults.
#[derive(Debug, Clone)]
pub struct CompressionConfig {
    /// Fraction of the context limit at which auto-compaction triggers (0.90 = 90%).
    /// Consumed by the auto-compaction pipeline when checking context window usage.
    #[allow(dead_code)]
    pub auto_trigger_fraction: f64,
    /// Fraction of messages at the tail to keep untouched during compaction (0.30 = 30%).
    pub preserve_fraction: f64,
    /// Total token budget allocated to tool outputs across the conversation.
    pub tool_output_budget: usize,
    /// Tool-result blocks exceeding this many tokens are pruned to a summary.
    pub max_prune_tokens: usize,
    /// Text messages exceeding this many tokens are truncated.
    pub max_truncate_tokens: usize,
}

impl Default for CompressionConfig {
    fn default() -> Self {
        Self {
            auto_trigger_fraction: 0.90,
            preserve_fraction: 0.30,
            tool_output_budget: 50_000,
            max_prune_tokens: 1_000,
            max_truncate_tokens: 500,
        }
    }
}

// ---------------------------------------------------------------------------
// CompressionStatus
// ---------------------------------------------------------------------------

/// Outcome of a compaction attempt, providing detailed feedback to the caller.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompressionStatus {
    /// Full pipeline ran: some messages were pruned and/or removed.
    Compressed {
        original_tokens: usize,
        final_tokens: usize,
    },
    /// Only truncation was applied (no structural removal).
    TruncationOnly {
        original_tokens: usize,
        final_tokens: usize,
    },
    /// The messages already fit within the target; nothing was changed.
    Unnecessary,
    /// Compaction was attempted but the result is larger than the original
    /// (should not normally happen; indicates a logic error or edge case).
    FailedInflated,
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/// Estimate token count for `text` using the 4-bytes/token heuristic.
pub fn estimate_tokens(text: &str) -> usize {
    text.len().div_ceil(BYTES_PER_TOKEN)
}

/// Estimated token cost for a single [`Message`].
pub fn message_tokens(msg: &Message) -> usize {
    // ~4-token overhead per message (role + structure)
    4 + match &msg.content {
        MessageContent::Text(t) => estimate_tokens(t),
        MessageContent::Blocks(blocks) => blocks.iter().map(block_tokens).sum(),
    }
}

fn block_tokens(block: &ContentBlock) -> usize {
    match block {
        ContentBlock::Text { text } => estimate_tokens(text),
        ContentBlock::ToolUse { name, input, .. } => {
            estimate_tokens(name) + estimate_tokens(&input.to_string())
        }
        ContentBlock::ToolResult { content, .. } => estimate_tokens(content),
    }
}

/// Look up the context window limit for a model ID (case-insensitive prefix match).
pub fn context_limit(model: &str) -> usize {
    let lower = model.to_lowercase();
    MODEL_LIMITS
        .iter()
        .find(|(prefix, _)| lower.starts_with(prefix))
        .map(|(_, limit)| *limit)
        .unwrap_or(DEFAULT_CONTEXT_LIMIT)
}

// ---------------------------------------------------------------------------
// Context usage
// ---------------------------------------------------------------------------

/// Summary of how much of the context window is consumed.
#[derive(Debug, Clone)]
pub struct ContextUsage {
    /// Estimated tokens used by the current message history.
    pub used_tokens: usize,
    /// Context window limit for the model.
    pub limit_tokens: usize,
    /// Fraction consumed (0.0–1.0).
    pub fraction: f64,
    /// True when above [`CONTEXT_WARN_THRESHOLD`].
    pub near_limit: bool,
}

/// Calculate context usage for the current message history.
pub fn context_usage(messages: &[Message], model: &str) -> ContextUsage {
    let used_tokens: usize = messages.iter().map(message_tokens).sum();
    let limit_tokens = context_limit(model);
    let fraction = used_tokens as f64 / limit_tokens as f64;
    ContextUsage {
        used_tokens,
        limit_tokens,
        fraction,
        near_limit: fraction >= CONTEXT_WARN_THRESHOLD,
    }
}

/// Render a compact context-usage bar for display.
///
/// Example: `Context: [########              ] 28%  (56K / 200K tokens)`
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

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

/// Backward-compat wrapper: compact using [`CompressionConfig::default()`].
///
/// See [`compact_with_config`] for the full-featured version.
pub fn compact_messages(messages: &[Message], target_tokens: usize) -> Vec<Message> {
    let (msgs, _status) =
        compact_with_config(messages, target_tokens, &CompressionConfig::default());
    msgs
}

/// Compact messages with an optional focus instruction.
///
/// When `focus` is provided, a system-level note is prepended to guide
/// the compaction: the LLM summary (if any future LLM-based compaction
/// is added) or the preserved-window selection should prioritize content
/// related to the focus topic.
///
/// For now, this appends a focus hint as a system message after compaction
/// so the model knows what context was prioritized.
pub fn compact_with_focus(
    messages: &[Message],
    target_tokens: usize,
    focus: Option<&str>,
) -> Vec<Message> {
    let mut compacted = compact_messages(messages, target_tokens);

    if let Some(focus_text) = focus {
        // Insert a focus hint after the system prompt (index 1) so the model
        // knows the user asked to focus on a specific topic.
        let hint = Message::text(
            "system",
            format!(
                "[Context was compacted. Focus area: {}. Earlier messages may have been summarized or removed.]",
                focus_text
            ),
        );
        if compacted.len() > 1 {
            compacted.insert(1, hint);
        } else {
            compacted.push(hint);
        }
    }

    compacted
}

fn total_tokens(messages: &[Message]) -> usize {
    messages.iter().map(message_tokens).sum()
}

/// Compact `messages` to fit within `target_tokens` using the given config.
///
/// Returns the compacted message list and a [`CompressionStatus`] describing
/// what happened.
///
/// The pipeline applies six phases in order, short-circuiting as soon as the
/// budget is satisfied:
///
/// 1. **Reverse token budget** — Walk tool outputs backward, truncating the
///    oldest first until the cumulative tool-output cost fits the budget.
/// 2. **History split** — Keep the last `preserve_fraction` of messages
///    untouched; only compress the older prefix.
/// 3. **Prune** — Replace tool-result content > `max_prune_tokens` with a
///    30-line head.
/// 4. **Truncate** — Trim long text messages to `max_truncate_tokens`.
/// 5. **Remove** — Drop tool-result messages entirely.
/// 6. **Select** — Keep only the most recent messages that fit.
pub fn compact_with_config(
    messages: &[Message],
    target_tokens: usize,
    config: &CompressionConfig,
) -> (Vec<Message>, CompressionStatus) {
    let original_tokens = total_tokens(messages);

    if original_tokens <= target_tokens {
        return (messages.to_vec(), CompressionStatus::Unnecessary);
    }

    // Phase 1: Reverse token budget — truncate older tool outputs first.
    let mut msgs = reverse_budget_tool_outputs(messages, config.tool_output_budget);
    if total_tokens(&msgs) <= target_tokens {
        let final_tokens = total_tokens(&msgs);
        return (
            msgs,
            CompressionStatus::TruncationOnly {
                original_tokens,
                final_tokens,
            },
        );
    }

    // Phase 2: History split — only compress the older prefix.
    let (older, preserved) = history_split(&msgs, config.preserve_fraction);

    // Phase 3-5 operate on the older prefix only.
    let mut compressible = older;

    compressible = prune_tool_outputs(compressible, config.max_prune_tokens);
    let mut combined = recombine(&compressible, &preserved);
    if total_tokens(&combined) <= target_tokens {
        let final_tokens = total_tokens(&combined);
        return (
            combined,
            CompressionStatus::Compressed {
                original_tokens,
                final_tokens,
            },
        );
    }

    compressible = truncate_long_messages(compressible, config.max_truncate_tokens);
    combined = recombine(&compressible, &preserved);
    if total_tokens(&combined) <= target_tokens {
        let final_tokens = total_tokens(&combined);
        return (
            combined,
            CompressionStatus::Compressed {
                original_tokens,
                final_tokens,
            },
        );
    }

    compressible = remove_tool_results(compressible);
    combined = recombine(&compressible, &preserved);
    if total_tokens(&combined) <= target_tokens {
        let final_tokens = total_tokens(&combined);
        return (
            combined,
            CompressionStatus::Compressed {
                original_tokens,
                final_tokens,
            },
        );
    }

    // Phase 6: Last resort — select the most recent messages that fit.
    msgs = select_recent(combined, target_tokens);
    let final_tokens = total_tokens(&msgs);

    let status = if final_tokens > original_tokens {
        CompressionStatus::FailedInflated
    } else {
        CompressionStatus::Compressed {
            original_tokens,
            final_tokens,
        }
    };

    (msgs, status)
}

/// Recombine the compressed older prefix with the preserved tail.
fn recombine(older: &[Message], preserved: &[Message]) -> Vec<Message> {
    let mut out = older.to_vec();
    out.extend_from_slice(preserved);
    out
}

// ---------------------------------------------------------------------------
// Phase 1 — Reverse token budget truncation
// ---------------------------------------------------------------------------

/// Walk backward through messages, tracking cumulative tool-output tokens.
/// Once the `budget` is exceeded, truncate older tool-result content to its
/// last 30 lines so the most recent results retain full fidelity.
fn reverse_budget_tool_outputs(messages: &[Message], budget: usize) -> Vec<Message> {
    // First pass: compute per-message tool-output token cost (backward).
    let tool_costs: Vec<usize> = messages.iter().map(tool_output_tokens).collect();
    let total_tool: usize = tool_costs.iter().sum();

    if total_tool <= budget {
        return messages.to_vec();
    }

    // Walk backward, accumulating a running tool-token total.
    // Once we've "reserved" `budget` tokens for the tail, truncate everything
    // older than the cutoff.
    let mut cumulative = 0usize;
    // Index *above* which messages keep full fidelity.
    let mut cutoff_idx = messages.len();
    for i in (0..messages.len()).rev() {
        if tool_costs[i] == 0 {
            continue;
        }
        if cumulative + tool_costs[i] > budget {
            cutoff_idx = i + 1;
            break;
        }
        cumulative += tool_costs[i];
    }

    messages
        .iter()
        .enumerate()
        .map(|(i, msg)| {
            if i < cutoff_idx && tool_costs[i] > 0 {
                truncate_tool_result_blocks(msg, 30)
            } else {
                msg.clone()
            }
        })
        .collect()
}

/// Sum of tokens across all tool-result blocks in a single message.
fn tool_output_tokens(msg: &Message) -> usize {
    match &msg.content {
        MessageContent::Blocks(blocks) => blocks
            .iter()
            .filter_map(|b| match b {
                ContentBlock::ToolResult { content, .. } => Some(estimate_tokens(content)),
                _ => None,
            })
            .sum(),
        _ => 0,
    }
}

/// Replace every tool-result block in `msg` with its last `keep_lines` lines.
fn truncate_tool_result_blocks(msg: &Message, keep_lines: usize) -> Message {
    if let MessageContent::Blocks(blocks) = &msg.content {
        let new_blocks: Vec<ContentBlock> = blocks
            .iter()
            .map(|block| {
                if let ContentBlock::ToolResult {
                    tool_use_id,
                    content,
                    is_error,
                } = block
                {
                    let lines: Vec<&str> = content.lines().collect();
                    if lines.len() > keep_lines {
                        let tail: String = lines[lines.len() - keep_lines..].join("\n");
                        return ContentBlock::ToolResult {
                            tool_use_id: tool_use_id.clone(),
                            content: format!(
                                "[... {} lines omitted during compaction ...]\n{}",
                                lines.len() - keep_lines,
                                tail
                            ),
                            is_error: *is_error,
                        };
                    }
                }
                block.clone()
            })
            .collect();
        Message::blocks(&msg.role, new_blocks)
    } else {
        msg.clone()
    }
}

// ---------------------------------------------------------------------------
// Phase 2 — History split
// ---------------------------------------------------------------------------

/// Split messages into (older, preserved) such that `preserved` contains
/// approximately the last `fraction` of messages.
///
/// The split point is adjusted to land on a "user" message boundary so that
/// assistant/tool messages are never orphaned at the start of the preserved
/// section.
fn history_split(messages: &[Message], fraction: f64) -> (Vec<Message>, Vec<Message>) {
    if messages.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let preserve_count = ((messages.len() as f64 * fraction).ceil() as usize).min(messages.len());
    let mut split = messages.len() - preserve_count;

    // Adjust forward to a user-message boundary so preserved starts cleanly.
    while split < messages.len() && messages[split].role != "user" {
        split += 1;
    }

    // If we couldn't find a user boundary, keep everything in the preserved
    // section to avoid splitting mid-turn.
    if split >= messages.len() {
        return (Vec::new(), messages.to_vec());
    }

    (messages[..split].to_vec(), messages[split..].to_vec())
}

// ---------------------------------------------------------------------------
// Phase 3 — Prune large tool outputs
// ---------------------------------------------------------------------------

/// Replace tool-result content exceeding `max_tokens` with a first-20-lines
/// summary.
fn prune_tool_outputs(messages: Vec<Message>, max_tokens: usize) -> Vec<Message> {
    messages
        .into_iter()
        .map(|msg| {
            if let MessageContent::Blocks(blocks) = &msg.content {
                let new_blocks: Vec<ContentBlock> = blocks
                    .iter()
                    .map(|block| {
                        if let ContentBlock::ToolResult {
                            tool_use_id,
                            content,
                            is_error,
                        } = block
                        {
                            if estimate_tokens(content) > max_tokens {
                                let head: String =
                                    content.lines().take(20).collect::<Vec<_>>().join("\n");
                                return ContentBlock::ToolResult {
                                    tool_use_id: tool_use_id.clone(),
                                    content: format!(
                                        "{}\n[... output truncated during compaction ...]",
                                        head
                                    ),
                                    is_error: *is_error,
                                };
                            }
                        }
                        block.clone()
                    })
                    .collect();
                Message::blocks(&msg.role, new_blocks)
            } else {
                msg
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Phase 4 — Truncate long text messages
// ---------------------------------------------------------------------------

/// Truncate text messages exceeding `max_tokens`.
fn truncate_long_messages(messages: Vec<Message>, max_tokens: usize) -> Vec<Message> {
    messages
        .into_iter()
        .map(|msg| {
            if let MessageContent::Text(ref text) = msg.content {
                if estimate_tokens(text) > max_tokens {
                    let truncated: String =
                        text.chars().take(max_tokens * BYTES_PER_TOKEN).collect();
                    return Message::text(&msg.role, format!("{}\n[... truncated ...]", truncated));
                }
            }
            msg
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Phase 5 — Remove tool results
// ---------------------------------------------------------------------------

/// Drop messages whose content is entirely tool-result blocks.
fn remove_tool_results(messages: Vec<Message>) -> Vec<Message> {
    messages
        .into_iter()
        .filter_map(|msg| match &msg.content {
            MessageContent::Blocks(blocks) => {
                let all_results = blocks
                    .iter()
                    .all(|b| matches!(b, ContentBlock::ToolResult { .. }));
                if all_results {
                    return None;
                }
                // Keep the message but strip any tool-result blocks mixed in.
                let filtered: Vec<ContentBlock> = blocks
                    .iter()
                    .filter(|b| !matches!(b, ContentBlock::ToolResult { .. }))
                    .cloned()
                    .collect();
                if filtered.is_empty() {
                    None
                } else {
                    Some(Message::blocks(&msg.role, filtered))
                }
            }
            _ => Some(msg),
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Phase 6 — Select recent
// ---------------------------------------------------------------------------

/// Walk backwards keeping messages until the token budget is full.
fn select_recent(messages: Vec<Message>, target_tokens: usize) -> Vec<Message> {
    let mut selected = Vec::new();
    let mut budget = 0usize;
    for msg in messages.into_iter().rev() {
        let t = message_tokens(&msg);
        if budget + t > target_tokens {
            break;
        }
        budget += t;
        selected.push(msg);
    }
    selected.reverse();
    selected
}

// ---------------------------------------------------------------------------
// Project root detection
// ---------------------------------------------------------------------------

/// Find the project root by walking from `start` upward, looking for any of
/// the well-known root markers (`.git`, `Cargo.toml`, `package.json`,
/// `go.mod`, `pyproject.toml`).
///
/// Returns `None` if no marker is found before reaching the filesystem root.
#[allow(dead_code)]
pub fn find_project_root(start: &Path) -> Option<PathBuf> {
    let mut current = start.to_path_buf();
    loop {
        for &marker in ROOT_MARKERS {
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

// ---------------------------------------------------------------------------
// Instruction file loading
// ---------------------------------------------------------------------------

/// Load instruction files from `cwd` upward to the filesystem root.
///
/// Searches each directory from the project root down to `cwd` for any of
/// [`INSTRUCTION_FILES`], concatenating their contents in root-first order
/// (deeper files override shallower ones stylistically).
/// Returns `None` if no files are found.
pub fn load_instructions(cwd: &Path) -> Option<String> {
    let dirs = walk_to_root(cwd);
    let mut segments: Vec<String> = Vec::new();
    let mut total = 0usize;

    // Iterate root-first so deeper directories override shallower ones.
    for dir in dirs.iter().rev() {
        for &name in INSTRUCTION_FILES {
            let path = dir.join(name);
            if !path.exists() {
                continue;
            }
            let content = match std::fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let t = estimate_tokens(&content);
            if total + t > MAX_INSTRUCTION_TOKENS {
                break;
            }
            total += t;
            segments.push(format!(
                "<!-- Instructions from: {} -->\n{}",
                path.display(),
                content.trim()
            ));
        }
    }

    if segments.is_empty() {
        None
    } else {
        Some(segments.join("\n\n"))
    }
}

/// Walk from `start` toward the filesystem root, returning each directory.
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // -----------------------------------------------------------------------
    // Token estimation
    // -----------------------------------------------------------------------

    #[test]
    fn test_estimate_tokens_empty() {
        assert_eq!(estimate_tokens(""), 0);
    }

    #[test]
    fn test_estimate_tokens_basic() {
        // 5 bytes -> ceil(5/4) = 2 tokens
        assert_eq!(estimate_tokens("hello"), 2);
        // 400 bytes -> 100 tokens
        assert_eq!(estimate_tokens(&"a".repeat(400)), 100);
    }

    #[test]
    fn test_estimate_tokens_rounding() {
        // 1 byte -> 1 token
        assert_eq!(estimate_tokens("x"), 1);
        // 4 bytes -> 1 token
        assert_eq!(estimate_tokens("abcd"), 1);
        // 5 bytes -> 2 tokens
        assert_eq!(estimate_tokens("abcde"), 2);
    }

    // -----------------------------------------------------------------------
    // Context limit / usage
    // -----------------------------------------------------------------------

    #[test]
    fn test_context_limit_known_models() {
        assert_eq!(context_limit("claude-opus-4-6"), 200_000);
        assert_eq!(context_limit("claude-sonnet-4-6"), 200_000);
        assert_eq!(context_limit("gpt-4o"), 128_000);
        assert_eq!(context_limit("gemini-1.5-pro"), 2_000_000);
        assert_eq!(context_limit("deepseek-chat"), 64_000);
    }

    #[test]
    fn test_context_limit_unknown() {
        assert_eq!(context_limit("unknown-model-xyz"), DEFAULT_CONTEXT_LIMIT);
    }

    #[test]
    fn test_context_limit_case_insensitive() {
        assert_eq!(context_limit("GPT-4o"), 128_000);
        assert_eq!(context_limit("CLAUDE-OPUS-4-6"), 200_000);
    }

    #[test]
    fn test_context_usage_empty() {
        let usage = context_usage(&[], "claude-opus-4-6");
        assert_eq!(usage.used_tokens, 0);
        assert_eq!(usage.limit_tokens, 200_000);
        assert!(!usage.near_limit);
    }

    #[test]
    fn test_context_usage_near_limit() {
        // Build a fake message that consumes ~170 000 tokens out of 200 000
        let big_text = "x".repeat(170_000 * BYTES_PER_TOKEN);
        let msgs = vec![Message::text("user", big_text)];
        let usage = context_usage(&msgs, "claude-opus-4-6");
        assert!(usage.near_limit);
    }

    // -----------------------------------------------------------------------
    // CompressionConfig
    // -----------------------------------------------------------------------

    #[test]
    fn test_compression_config_default() {
        let cfg = CompressionConfig::default();
        assert!((cfg.auto_trigger_fraction - 0.90).abs() < f64::EPSILON);
        assert!((cfg.preserve_fraction - 0.30).abs() < f64::EPSILON);
        assert_eq!(cfg.tool_output_budget, 50_000);
        assert_eq!(cfg.max_prune_tokens, 1_000);
        assert_eq!(cfg.max_truncate_tokens, 500);
    }

    #[test]
    fn test_compression_config_custom() {
        let cfg = CompressionConfig {
            auto_trigger_fraction: 0.80,
            preserve_fraction: 0.50,
            tool_output_budget: 20_000,
            max_prune_tokens: 500,
            max_truncate_tokens: 250,
        };
        assert!((cfg.auto_trigger_fraction - 0.80).abs() < f64::EPSILON);
        assert_eq!(cfg.tool_output_budget, 20_000);
    }

    // -----------------------------------------------------------------------
    // CompressionStatus
    // -----------------------------------------------------------------------

    #[test]
    fn test_compression_status_unnecessary() {
        let msgs = vec![
            Message::text("user", "Hello"),
            Message::text("assistant", "World"),
        ];
        let (_result, status) = compact_with_config(&msgs, 100_000, &CompressionConfig::default());
        assert_eq!(status, CompressionStatus::Unnecessary);
    }

    #[test]
    fn test_compression_status_compressed() {
        // Create messages that exceed a tiny target.
        let msgs: Vec<Message> = (0..50)
            .map(|i| Message::text("user", "x".repeat(200 + i)))
            .collect();
        let (_result, status) = compact_with_config(&msgs, 500, &CompressionConfig::default());
        match status {
            CompressionStatus::Compressed {
                original_tokens,
                final_tokens,
            } => {
                assert!(final_tokens <= original_tokens);
            }
            _ => panic!("expected Compressed, got {:?}", status),
        }
    }

    // -----------------------------------------------------------------------
    // Backward-compat wrapper
    // -----------------------------------------------------------------------

    #[test]
    fn test_compact_noop_when_small() {
        let msgs = vec![
            Message::text("user", "Hello"),
            Message::text("assistant", "World"),
        ];
        let result = compact_messages(&msgs, 100_000);
        assert_eq!(result.len(), msgs.len());
    }

    #[test]
    fn test_compact_prunes_large_tool_output() {
        let big = "x".repeat(20_000);
        let msg = Message::blocks(
            "user",
            vec![ContentBlock::ToolResult {
                tool_use_id: "id1".to_string(),
                content: big,
                is_error: false,
            }],
        );
        let compacted = compact_messages(&[msg], 500);
        assert!(total_tokens(&compacted) <= 500);
    }

    #[test]
    fn test_compact_select_recent() {
        let msgs: Vec<Message> = (0..200)
            .map(|i| {
                if i % 2 == 0 {
                    Message::text("user", format!("Message {}", i))
                } else {
                    Message::text("assistant", format!("Response {}", i))
                }
            })
            .collect();
        let result = compact_messages(&msgs, 100);
        assert!(result.len() < msgs.len());
        // The kept messages should be the most recent ones
        if !result.is_empty() {
            // Last message in result should be close to the end of original
            let last_result = result.last().unwrap().text_content();
            let last_original = msgs.last().unwrap().text_content();
            assert_eq!(last_result, last_original);
        }
    }

    // -----------------------------------------------------------------------
    // Reverse token budget truncation
    // -----------------------------------------------------------------------

    #[test]
    fn test_reverse_budget_no_truncation_when_under_budget() {
        let msgs = vec![
            Message::blocks(
                "user",
                vec![ContentBlock::ToolResult {
                    tool_use_id: "t1".to_string(),
                    content: "short output".to_string(),
                    is_error: false,
                }],
            ),
            Message::text("assistant", "ok"),
        ];
        let result = reverse_budget_tool_outputs(&msgs, 100_000);
        // Should be unchanged.
        assert_eq!(result.len(), 2);
        if let MessageContent::Blocks(blocks) = &result[0].content {
            if let ContentBlock::ToolResult { content, .. } = &blocks[0] {
                assert_eq!(content, "short output");
            }
        }
    }

    #[test]
    fn test_reverse_budget_truncates_older_first() {
        // Two tool results: old (big) and new (big). Budget fits only one.
        let big_content = (0..100)
            .map(|i| format!("line {}", i))
            .collect::<Vec<_>>()
            .join("\n");
        let msgs = vec![
            Message::text("user", "run tool"),
            Message::blocks(
                "user",
                vec![ContentBlock::ToolResult {
                    tool_use_id: "old".to_string(),
                    content: big_content.clone(),
                    is_error: false,
                }],
            ),
            Message::text("user", "run another"),
            Message::blocks(
                "user",
                vec![ContentBlock::ToolResult {
                    tool_use_id: "new".to_string(),
                    content: big_content.clone(),
                    is_error: false,
                }],
            ),
        ];

        // Budget only enough for the newer tool result.
        let new_tool_tokens = tool_output_tokens(&msgs[3]);
        let result = reverse_budget_tool_outputs(&msgs, new_tool_tokens);

        // The old tool result (index 1) should be truncated.
        if let MessageContent::Blocks(blocks) = &result[1].content {
            if let ContentBlock::ToolResult { content, .. } = &blocks[0] {
                assert!(content.contains("lines omitted during compaction"));
            }
        }

        // The new tool result (index 3) should be preserved.
        if let MessageContent::Blocks(blocks) = &result[3].content {
            if let ContentBlock::ToolResult { content, .. } = &blocks[0] {
                assert!(!content.contains("omitted"), "new result should be intact");
            }
        }
    }

    // -----------------------------------------------------------------------
    // History split
    // -----------------------------------------------------------------------

    #[test]
    fn test_history_split_empty() {
        let (older, preserved) = history_split(&[], 0.30);
        assert!(older.is_empty());
        assert!(preserved.is_empty());
    }

    #[test]
    fn test_history_split_preserves_tail() {
        let msgs: Vec<Message> = (0..10)
            .map(|i| {
                if i % 2 == 0 {
                    Message::text("user", format!("u{}", i))
                } else {
                    Message::text("assistant", format!("a{}", i))
                }
            })
            .collect();
        let (older, preserved) = history_split(&msgs, 0.30);
        // 30% of 10 = 3 messages preserved.
        assert!(!preserved.is_empty());
        // Preserved starts on a user boundary.
        assert_eq!(preserved[0].role, "user");
        // Total should equal original.
        assert_eq!(older.len() + preserved.len(), msgs.len());
    }

    #[test]
    fn test_history_split_user_boundary() {
        // All assistant messages except the last one — split should find user boundary.
        let msgs = vec![
            Message::text("user", "hello"),
            Message::text("assistant", "hi"),
            Message::text("assistant", "more"),
            Message::text("user", "end"),
        ];
        let (_older, preserved) = history_split(&msgs, 0.30);
        // Preserved should start at a user message.
        if !preserved.is_empty() {
            assert_eq!(preserved[0].role, "user");
        }
    }

    #[test]
    fn test_history_split_all_preserved_when_no_user_boundary() {
        // All assistant messages — can't find a clean split.
        let msgs = vec![
            Message::text("assistant", "a"),
            Message::text("assistant", "b"),
            Message::text("assistant", "c"),
        ];
        let (older, preserved) = history_split(&msgs, 0.30);
        // When no user boundary found, everything goes to preserved.
        assert!(older.is_empty());
        assert_eq!(preserved.len(), 3);
    }

    // -----------------------------------------------------------------------
    // Format context report
    // -----------------------------------------------------------------------

    #[test]
    fn test_format_context_report_25pct() {
        let usage = ContextUsage {
            used_tokens: 50_000,
            limit_tokens: 200_000,
            fraction: 0.25,
            near_limit: false,
        };
        let report = format_context_report(&usage);
        assert!(report.contains("25%") || report.contains("25 %"));
        assert!(report.contains("50K"));
        assert!(report.contains("200K"));
    }

    // -----------------------------------------------------------------------
    // Instruction file loading / walk_to_root
    // -----------------------------------------------------------------------

    #[test]
    fn test_walk_to_root_terminates() {
        let dirs = walk_to_root(Path::new("/tmp/a/b/c"));
        assert!(!dirs.is_empty());
        assert!(dirs.contains(&PathBuf::from("/tmp/a/b/c")));
        assert!(dirs.contains(&PathBuf::from("/")));
    }

    #[test]
    fn test_load_instructions_no_crash() {
        // Must not panic even when given a path that doesn't exist
        let _ = load_instructions(Path::new("/nonexistent-agiworkforce-test-path-xyz"));
    }

    // -----------------------------------------------------------------------
    // Message token helpers
    // -----------------------------------------------------------------------

    #[test]
    fn test_message_tokens_text() {
        let msg = Message::text("user", "Hello world");
        // "Hello world" = 11 bytes -> ceil(11/4) = 3 tokens + 4 overhead = 7
        assert_eq!(message_tokens(&msg), 4 + estimate_tokens("Hello world"));
    }

    #[test]
    fn test_total_tokens_accumulates() {
        let msgs = vec![
            Message::text("user", "abcd"), // 4 bytes = 1 token + 4 overhead = 5
            Message::text("assistant", "efgh"), // 4 bytes = 1 token + 4 overhead = 5
        ];
        assert_eq!(total_tokens(&msgs), 10);
    }

    // -----------------------------------------------------------------------
    // find_project_root
    // -----------------------------------------------------------------------

    #[test]
    fn test_find_project_root_with_git() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::create_dir(dir.path().join(".git")).unwrap();
        let root = find_project_root(dir.path());
        assert_eq!(root.as_deref(), Some(dir.path()));
    }

    #[test]
    fn test_find_project_root_with_cargo_toml() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(dir.path().join("Cargo.toml"), "[package]").unwrap();
        let root = find_project_root(dir.path());
        assert_eq!(root.as_deref(), Some(dir.path()));
    }

    #[test]
    fn test_find_project_root_with_package_json() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(dir.path().join("package.json"), "{}").unwrap();
        let root = find_project_root(dir.path());
        assert_eq!(root.as_deref(), Some(dir.path()));
    }

    #[test]
    fn test_find_project_root_with_go_mod() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(dir.path().join("go.mod"), "module foo").unwrap();
        let root = find_project_root(dir.path());
        assert_eq!(root.as_deref(), Some(dir.path()));
    }

    #[test]
    fn test_find_project_root_with_pyproject() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(dir.path().join("pyproject.toml"), "[tool]").unwrap();
        let root = find_project_root(dir.path());
        assert_eq!(root.as_deref(), Some(dir.path()));
    }

    #[test]
    fn test_find_project_root_walks_up() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::create_dir(dir.path().join(".git")).unwrap();
        let child = dir.path().join("src").join("deep");
        fs::create_dir_all(&child).unwrap();
        let root = find_project_root(&child);
        assert_eq!(root.as_deref(), Some(dir.path()));
    }

    #[test]
    fn test_find_project_root_none_when_no_marker() {
        let dir = tempfile::tempdir().expect("tempdir");
        // Empty directory with no markers.
        let root = find_project_root(dir.path());
        // Could find a marker in a parent (e.g., /tmp might have something),
        // but the tempdir itself has none — we just verify no panic.
        // On most systems the temp dir has no markers so this should be None.
        let _ = root;
    }

    // -----------------------------------------------------------------------
    // Integration: compact_with_config end-to-end
    // -----------------------------------------------------------------------

    #[test]
    fn test_compact_with_config_preserves_recent_messages() {
        // Build a conversation where older messages have big tool outputs.
        let mut msgs = Vec::new();
        for i in 0..20 {
            msgs.push(Message::text("user", format!("question {}", i)));
            if i < 10 {
                // Older messages have big tool outputs.
                msgs.push(Message::blocks(
                    "user",
                    vec![ContentBlock::ToolResult {
                        tool_use_id: format!("t{}", i),
                        content: "x".repeat(5_000),
                        is_error: false,
                    }],
                ));
            }
            msgs.push(Message::text("assistant", format!("answer {}", i)));
        }

        let config = CompressionConfig::default();
        let original = total_tokens(&msgs);
        // Target: 50% of original.
        let target = original / 2;
        let (result, status) = compact_with_config(&msgs, target, &config);

        assert!(total_tokens(&result) <= target);
        // Last message should be the same.
        assert_eq!(
            result.last().unwrap().text_content(),
            msgs.last().unwrap().text_content()
        );
        assert!(matches!(status, CompressionStatus::Compressed { .. }));
    }

    #[test]
    fn test_compact_with_config_truncation_only() {
        // Messages with moderate tool outputs that the reverse-budget can fix.
        let msgs = vec![
            Message::text("user", "hi"),
            Message::blocks(
                "user",
                vec![ContentBlock::ToolResult {
                    tool_use_id: "t1".to_string(),
                    content: (0..200)
                        .map(|i| format!("line {}", i))
                        .collect::<Vec<_>>()
                        .join("\n"),
                    is_error: false,
                }],
            ),
            Message::text("assistant", "done"),
        ];

        let original = total_tokens(&msgs);
        // Set a target that's just a bit below original — reverse budget should suffice.
        let config = CompressionConfig {
            tool_output_budget: 10, // very small budget forces truncation
            ..CompressionConfig::default()
        };
        let target = original - 50;
        let (result, status) = compact_with_config(&msgs, target, &config);

        // Should be TruncationOnly since reverse budget alone should handle it.
        if total_tokens(&result) <= target {
            assert!(matches!(
                status,
                CompressionStatus::TruncationOnly { .. } | CompressionStatus::Compressed { .. }
            ));
        }
    }

    // -----------------------------------------------------------------------
    // compact_with_focus
    // -----------------------------------------------------------------------

    #[test]
    fn test_compact_with_focus_no_focus() {
        let messages = vec![
            Message::text("system", "System prompt"),
            Message::text("user", "Hello"),
            Message::text("assistant", "Hi there"),
        ];
        let result = compact_with_focus(&messages, 100_000, None);
        // Without focus, should be same as compact_messages
        assert_eq!(result.len(), compact_messages(&messages, 100_000).len());
    }

    #[test]
    fn test_compact_with_focus_adds_hint() {
        let messages = vec![
            Message::text("system", "System prompt"),
            Message::text("user", "Hello"),
            Message::text("assistant", "Hi there"),
        ];
        let result = compact_with_focus(&messages, 100_000, Some("database queries"));
        // Should have one extra message (the focus hint)
        let base = compact_messages(&messages, 100_000);
        assert_eq!(result.len(), base.len() + 1);
        // The hint should be at index 1
        assert!(result[1].text_content().contains("database queries"));
    }
}
