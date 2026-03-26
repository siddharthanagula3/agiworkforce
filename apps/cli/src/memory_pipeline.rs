//! 2-Phase Memory Extraction Pipeline.
//!
//! Phase 1 — Session Summary Extraction (on session end):
//!   Collect the last N messages from a completed session, extract reusable
//!   learnings, and save them to `~/.agiworkforce/memories/session_summaries/{session_id}.md`.
//!
//! Phase 2 — Consolidation (on startup, max once per hour):
//!   Read all session summaries, merge/deduplicate into `~/.agiworkforce/memories/raw_memories.md`,
//!   and prune summaries older than 30 days.
//!
//! All operations are best-effort: errors are logged to stderr and never
//! block the main agent loop.

use anyhow::Result;
use std::fs;
use std::path::Path;

use crate::config::CliConfig;
use crate::models::{self, Message};

/// Maximum number of message characters to include in the extraction prompt.
const MAX_MESSAGE_CHARS: usize = 20_000; // ~5000 tokens at 4 chars/token

/// Minimum elapsed seconds since last consolidation before triggering a new one.
const CONSOLIDATION_COOLDOWN_SECS: u64 = 3_600; // 1 hour

/// Maximum age (in seconds) for session summaries before pruning.
const SUMMARY_MAX_AGE_SECS: u64 = 30 * 24 * 3_600; // 30 days

/// Timeout for LLM extraction calls (seconds).
const LLM_TIMEOUT_SECS: u64 = 30;

pub struct MemoryPipeline;

impl MemoryPipeline {
    // -----------------------------------------------------------------
    // Phase 1 — Session Summary Extraction
    // -----------------------------------------------------------------

    /// Extract learnings from a completed session. Best-effort, never blocks.
    ///
    /// Collects the last N messages (up to `MAX_MESSAGE_CHARS`), attempts an
    /// LLM call to extract reusable patterns, and writes the result to
    /// `~/.agiworkforce/memories/session_summaries/{session_id}.md`.
    ///
    /// If the LLM call fails or times out, falls back to saving raw message
    /// content as the summary.
    pub async fn extract_session_summary(
        home: &Path,
        session_id: &str,
        messages: &[Message],
        config: &CliConfig,
    ) -> Result<()> {
        let summaries_dir = home.join("memories").join("session_summaries");
        fs::create_dir_all(&summaries_dir)?;

        let output_path = summaries_dir.join(format!("{}.md", session_id));

        // Skip if already extracted
        if output_path.exists() {
            return Ok(());
        }

        // Collect recent message text (skip system prompt at index 0)
        let recent_text = collect_recent_messages(messages);
        if recent_text.trim().is_empty() {
            return Ok(());
        }

        let timestamp = chrono::Utc::now().to_rfc3339();

        // Attempt LLM extraction with timeout
        let model = resolve_fast_model(config);
        let extraction = tokio::time::timeout(
            std::time::Duration::from_secs(LLM_TIMEOUT_SECS),
            Self::call_extraction_llm(&recent_text, &model, config),
        )
        .await;

        let summary_body = match extraction {
            Ok(Ok(text)) if !text.trim().is_empty() => text,
            _ => {
                // Fallback: save raw message content as summary
                build_raw_summary(&recent_text)
            }
        };

        // Write with metadata header
        let content = format!(
            "---\nsession_id: {}\ntimestamp: {}\nmodel: {}\n---\n\n{}\n",
            session_id, timestamp, model, summary_body
        );

        fs::write(&output_path, content)?;
        Ok(())
    }

    /// Call the LLM to extract reusable learnings from session messages.
    async fn call_extraction_llm(
        recent_text: &str,
        model: &str,
        config: &CliConfig,
    ) -> Result<String> {
        let provider = models::detect_provider(model);

        let extraction_prompt = format!(
            "Analyze this conversation and extract reusable learnings. \
             Return ONLY facts worth remembering for future sessions:\n\
             - User preferences and conventions\n\
             - Project patterns and architecture decisions\n\
             - Tool usage patterns that worked well\n\
             - Coding style preferences\n\
             - Important technical decisions\n\n\
             Be concise. Use bullet points. Skip greetings.\n\n\
             <conversation>\n{}\n</conversation>",
            recent_text
        );

        let messages = vec![
            Message::text(
                "system",
                "You are a memory extraction assistant. Extract reusable patterns, \
                 user preferences, project conventions, and important decisions from \
                 the conversation. Return only facts worth remembering for future sessions. \
                 Be concise and use bullet points.",
            ),
            Message::text("user", extraction_prompt),
        ];

        let result = models::stream_completion(
            config,
            &provider,
            model,
            &messages,
            2048, // Short output for summaries
            None, // No tools needed
            Box::new(|_| {}), // Discard streaming chunks
        )
        .await?;

        Ok(result.text)
    }

    // -----------------------------------------------------------------
    // Phase 2 — Consolidation
    // -----------------------------------------------------------------

    /// Consolidate all session summaries into `raw_memories.md`.
    ///
    /// Reads all files in `session_summaries/`, concatenates them, and either
    /// calls the LLM to merge/deduplicate or (if the LLM call fails) writes
    /// the concatenation directly.
    pub async fn consolidate(home: &Path, config: &CliConfig) -> Result<()> {
        let summaries_dir = home.join("memories").join("session_summaries");
        let raw_path = home.join("memories").join("raw_memories.md");

        if !summaries_dir.exists() {
            return Ok(());
        }

        // Read all summary files
        let mut all_summaries = String::new();
        let mut count = 0u32;

        let mut entries: Vec<_> = fs::read_dir(&summaries_dir)?
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    == Some("md")
            })
            .collect();

        // Sort by modification time (newest last)
        entries.sort_by_key(|e| {
            e.metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
        });

        for entry in &entries {
            if let Ok(content) = fs::read_to_string(entry.path()) {
                // Strip frontmatter for consolidation input
                let body = strip_frontmatter(&content);
                if !body.trim().is_empty() {
                    all_summaries.push_str("---\n");
                    all_summaries.push_str(body.trim());
                    all_summaries.push_str("\n\n");
                    count += 1;
                }
            }
        }

        if count == 0 {
            return Ok(());
        }

        // Attempt LLM consolidation with timeout
        let model = resolve_fast_model(config);
        let consolidation = tokio::time::timeout(
            std::time::Duration::from_secs(LLM_TIMEOUT_SECS * 2), // Allow more time
            Self::call_consolidation_llm(&all_summaries, &model, config),
        )
        .await;

        let consolidated = match consolidation {
            Ok(Ok(text)) if !text.trim().is_empty() => text,
            _ => {
                // Fallback: deduplicate lines manually
                deduplicate_lines(&all_summaries)
            }
        };

        let header = format!(
            "# Persistent Memory\n\n\
             _Last consolidated: {} | {} session summaries merged_\n\n",
            chrono::Utc::now().to_rfc3339(),
            count,
        );

        fs::write(&raw_path, format!("{}{}\n", header, consolidated))?;

        // Prune old summaries
        Self::prune_old_summaries(home)?;

        Ok(())
    }

    /// Call the LLM to merge and deduplicate session summaries.
    async fn call_consolidation_llm(
        all_summaries: &str,
        model: &str,
        config: &CliConfig,
    ) -> Result<String> {
        let provider = models::detect_provider(model);

        let prompt = format!(
            "Merge and deduplicate these session learnings into a concise, organized \
             memory document. Remove duplicates. Group by topic (e.g., User Preferences, \
             Project Conventions, Tool Patterns, Technical Decisions). \
             Use bullet points. Keep only the most useful, actionable items.\n\n\
             <session_summaries>\n{}\n</session_summaries>",
            all_summaries
        );

        let messages = vec![
            Message::text(
                "system",
                "You are a memory consolidation assistant. Merge the provided session \
                 learnings into a single concise document. Remove duplicates, group by \
                 topic, and keep only actionable items. Output in markdown with bullet points.",
            ),
            Message::text("user", prompt),
        ];

        let result = models::stream_completion(
            config,
            &provider,
            model,
            &messages,
            4096,
            None,
            Box::new(|_| {}),
        )
        .await?;

        Ok(result.text)
    }

    // -----------------------------------------------------------------
    // Housekeeping
    // -----------------------------------------------------------------

    /// Check if consolidation is needed (>1 hour since last consolidation,
    /// or `raw_memories.md` doesn't exist yet).
    pub fn needs_consolidation(home: &Path) -> bool {
        let raw_path = home.join("memories").join("raw_memories.md");
        let summaries_dir = home.join("memories").join("session_summaries");

        // No summaries at all — nothing to consolidate
        if !summaries_dir.exists() {
            return false;
        }

        // Check if any summary files exist
        let has_summaries = fs::read_dir(&summaries_dir)
            .ok()
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .any(|e| {
                        e.path()
                            .extension()
                            .and_then(|ext| ext.to_str())
                            == Some("md")
                    })
            })
            .unwrap_or(false);

        if !has_summaries {
            return false;
        }

        // If raw_memories.md doesn't exist, consolidation is needed
        if !raw_path.exists() {
            return true;
        }

        // Check modification time of raw_memories.md
        let modified = fs::metadata(&raw_path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.elapsed().ok())
            .map(|elapsed| elapsed.as_secs())
            .unwrap_or(u64::MAX);

        modified >= CONSOLIDATION_COOLDOWN_SECS
    }

    /// Prune session summaries older than 30 days.
    pub fn prune_old_summaries(home: &Path) -> Result<()> {
        let summaries_dir = home.join("memories").join("session_summaries");
        if !summaries_dir.exists() {
            return Ok(());
        }

        let now = std::time::SystemTime::now();
        let entries = fs::read_dir(&summaries_dir)?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }

            let age = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| now.duration_since(t).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            if age > SUMMARY_MAX_AGE_SECS {
                let _ = fs::remove_file(&path);
            }
        }

        Ok(())
    }

    // -----------------------------------------------------------------
    // System prompt integration
    // -----------------------------------------------------------------

    /// Load `raw_memories.md` and format it for injection into the system prompt.
    ///
    /// Returns an empty string if the file doesn't exist or is empty.
    pub fn load_persistent_memory(home: &Path) -> String {
        let raw_path = home.join("memories").join("raw_memories.md");
        match fs::read_to_string(&raw_path) {
            Ok(content) if !content.trim().is_empty() => {
                format!(
                    "\n<persistent_memory>\n{}\n</persistent_memory>\n",
                    content.trim()
                )
            }
            _ => String::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Collect recent message text from a session, skipping the system prompt
/// and capping at `MAX_MESSAGE_CHARS`.
fn collect_recent_messages(messages: &[Message]) -> String {
    let mut collected = String::new();
    let mut total_chars = 0usize;

    // Walk backward from most recent, skip system prompt (index 0)
    for msg in messages.iter().rev() {
        if msg.role == "system" {
            continue;
        }
        let text = msg.text_content();
        if text.trim().is_empty() {
            continue;
        }

        let entry = format!("[{}]: {}\n\n", msg.role, text);
        let entry_len = entry.len();

        if total_chars + entry_len > MAX_MESSAGE_CHARS {
            // Include partial if we haven't collected anything yet
            if collected.is_empty() {
                let remaining = MAX_MESSAGE_CHARS.saturating_sub(total_chars);
                collected = format!("{}{}", &entry[..remaining.min(entry_len)], collected);
            }
            break;
        }

        collected = format!("{}{}", entry, collected);
        total_chars += entry_len;
    }

    collected
}

/// Resolve the fast model from config, falling back to the main model.
fn resolve_fast_model(config: &CliConfig) -> String {
    config
        .default
        .fast_model
        .clone()
        .unwrap_or_else(|| config.default.model.clone())
}

/// Build a raw summary from message text (used as fallback when LLM is unavailable).
fn build_raw_summary(recent_text: &str) -> String {
    // Extract key lines: lines starting with patterns that look like decisions/preferences
    let mut summary_lines = Vec::new();
    for line in recent_text.lines() {
        let trimmed = line.trim();
        // Skip empty lines and very short lines
        if trimmed.len() < 10 {
            continue;
        }
        // Include lines that look like they contain useful information
        let lower = trimmed.to_lowercase();
        if lower.contains("always")
            || lower.contains("prefer")
            || lower.contains("convention")
            || lower.contains("pattern")
            || lower.contains("decided")
            || lower.contains("important")
            || lower.contains("rule")
            || lower.contains("never")
            || lower.contains("must")
            || lower.contains("should")
        {
            summary_lines.push(format!("- {}", trimmed));
        }
    }

    if summary_lines.is_empty() {
        // If no key lines found, just include a truncated version
        let truncated: String = recent_text.chars().take(2000).collect();
        format!("## Raw Session Content\n\n{}", truncated)
    } else {
        summary_lines.join("\n")
    }
}

/// Strip YAML frontmatter from a markdown string.
fn strip_frontmatter(content: &str) -> &str {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return content;
    }
    let after_first = &trimmed[3..];
    if let Some(end_pos) = after_first.find("\n---") {
        let rest = &after_first[end_pos + 4..];
        rest.trim_start_matches('\n')
    } else {
        content
    }
}

/// Simple line-based deduplication (used as fallback when LLM is unavailable).
fn deduplicate_lines(text: &str) -> String {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();

    for line in text.lines() {
        let normalized = line.trim().to_lowercase();
        if normalized.is_empty() || normalized == "---" {
            // Always keep separators and blank lines
            result.push(line.to_string());
            continue;
        }
        if seen.insert(normalized) {
            result.push(line.to_string());
        }
    }

    result.join("\n")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collect_recent_messages_empty() {
        let messages: Vec<Message> = vec![];
        let text = collect_recent_messages(&messages);
        assert!(text.is_empty());
    }

    #[test]
    fn test_collect_recent_messages_skips_system() {
        let messages = vec![
            Message::text("system", "You are an assistant."),
            Message::text("user", "Hello"),
            Message::text("assistant", "Hi there!"),
        ];
        let text = collect_recent_messages(&messages);
        assert!(text.contains("[user]: Hello"));
        assert!(text.contains("[assistant]: Hi there!"));
        assert!(!text.contains("system"));
    }

    #[test]
    fn test_collect_recent_messages_caps_length() {
        let long_text = "x".repeat(MAX_MESSAGE_CHARS + 1000);
        let messages = vec![
            Message::text("system", "sys"),
            Message::text("user", &long_text),
        ];
        let text = collect_recent_messages(&messages);
        assert!(text.len() <= MAX_MESSAGE_CHARS + 100); // Allow some overhead for formatting
    }

    #[test]
    fn test_strip_frontmatter_basic() {
        let content = "---\nkey: value\n---\n\nBody content here.";
        let body = strip_frontmatter(content);
        assert_eq!(body, "Body content here.");
    }

    #[test]
    fn test_strip_frontmatter_no_frontmatter() {
        let content = "Just plain text.";
        let body = strip_frontmatter(content);
        assert_eq!(body, "Just plain text.");
    }

    #[test]
    fn test_deduplicate_lines() {
        let text = "- Always use cargo check\n- Always use cargo check\n- Run tests after changes";
        let result = deduplicate_lines(text);
        assert_eq!(
            result,
            "- Always use cargo check\n- Run tests after changes"
        );
    }

    #[test]
    fn test_build_raw_summary_with_keywords() {
        let text = "User says they always prefer TypeScript strict mode.\n\
                     Short.\n\
                     The convention is to use snake_case in Rust.\n\
                     Random chat about weather.";
        let summary = build_raw_summary(text);
        assert!(summary.contains("always prefer TypeScript"));
        assert!(summary.contains("convention is to use snake_case"));
    }

    #[test]
    fn test_build_raw_summary_no_keywords() {
        let text = "Hello world, this is a simple conversation about nothing in particular.";
        let summary = build_raw_summary(text);
        assert!(summary.contains("Raw Session Content"));
    }

    #[test]
    fn test_resolve_fast_model_with_override() {
        let mut config = CliConfig::default();
        config.default.fast_model = Some("claude-haiku-4-5".to_string());
        assert_eq!(resolve_fast_model(&config), "claude-haiku-4-5");
    }

    #[test]
    fn test_resolve_fast_model_fallback() {
        let config = CliConfig::default();
        assert_eq!(resolve_fast_model(&config), config.default.model);
    }

    #[test]
    fn test_needs_consolidation_no_dir() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        assert!(!MemoryPipeline::needs_consolidation(home));
    }

    #[test]
    fn test_needs_consolidation_no_summaries() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        fs::create_dir_all(home.join("memories").join("session_summaries")).unwrap();
        assert!(!MemoryPipeline::needs_consolidation(home));
    }

    #[test]
    fn test_needs_consolidation_with_summaries_no_raw() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let summaries = home.join("memories").join("session_summaries");
        fs::create_dir_all(&summaries).unwrap();
        fs::write(summaries.join("test.md"), "some content").unwrap();
        // No raw_memories.md exists — should need consolidation
        assert!(MemoryPipeline::needs_consolidation(home));
    }

    #[test]
    fn test_load_persistent_memory_empty() {
        let dir = tempfile::tempdir().unwrap();
        let result = MemoryPipeline::load_persistent_memory(dir.path());
        assert!(result.is_empty());
    }

    #[test]
    fn test_load_persistent_memory_with_content() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let memories_dir = home.join("memories");
        fs::create_dir_all(&memories_dir).unwrap();
        fs::write(
            memories_dir.join("raw_memories.md"),
            "# Memory\n\n- Always run tests",
        )
        .unwrap();
        let result = MemoryPipeline::load_persistent_memory(home);
        assert!(result.contains("<persistent_memory>"));
        assert!(result.contains("Always run tests"));
        assert!(result.contains("</persistent_memory>"));
    }

    #[test]
    fn test_prune_old_summaries_no_crash() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        // Should not crash even if directory doesn't exist
        let result = MemoryPipeline::prune_old_summaries(home);
        assert!(result.is_ok());
    }
}
