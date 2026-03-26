//! Learned Skills Auto-Generation.
//!
//! Analyzes completed sessions for repeating tool usage patterns and
//! generates SKILL.md files in `~/.agiworkforce/skills/learned/`.
//!
//! Pattern detection is heuristic-based (no LLM call needed):
//! 1. Query `sessions.db` for recent sessions (last 30 days)
//! 2. Find tool usage sequences that appear in 3+ sessions
//! 3. Generate a SKILL.md with the detected pattern
//!
//! All operations are best-effort and never block the main agent loop.

use anyhow::{Context, Result};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::sessions;

/// Minimum number of tool calls in a session to be eligible for pattern analysis.
const MIN_TOOL_CALLS: u32 = 5;

/// Minimum number of sessions a pattern must appear in to be considered learned.
const PATTERN_THRESHOLD: usize = 3;

/// Maximum age (days) of sessions to consider for pattern detection.
const SESSION_LOOKBACK_DAYS: i64 = 30;

/// Maximum number of learned skills to keep.
const MAX_LEARNED_SKILLS: usize = 50;

/// A detected tool usage pattern that qualifies as a learned skill.
#[derive(Debug, Clone)]
pub struct LearnedSkill {
    /// Skill name (auto-generated from the pattern).
    pub name: String,
    /// Human-readable description of the pattern.
    pub description: String,
    /// The extracted procedure/pattern (markdown).
    pub pattern: String,
    /// Confidence score (0.0 to 1.0).
    pub confidence: f32,
    /// Session IDs where this pattern was observed.
    pub source_sessions: Vec<String>,
}

pub struct SkillLearner;

impl SkillLearner {
    /// Analyze a completed session for learnable patterns.
    ///
    /// Compares the session's tool usage against recent sessions in the
    /// database. If a recurring pattern is found (same tool sequence in
    /// 3+ sessions), returns a `LearnedSkill`.
    ///
    /// `tool_calls` is a list of `(tool_name, count)` pairs from the session.
    pub fn analyze_session(
        home: &Path,
        session_id: &str,
        tool_calls: &[(String, u32)],
        was_successful: bool,
    ) -> Option<LearnedSkill> {
        // Only analyze successful sessions with enough tool calls
        if !was_successful {
            return None;
        }

        let total_calls: u32 = tool_calls.iter().map(|(_, c)| c).sum();
        if total_calls < MIN_TOOL_CALLS {
            return None;
        }

        // Build the current session's tool signature
        let current_sig = build_tool_signature(tool_calls);

        // Query recent sessions from the database
        let recent_patterns = match load_recent_tool_patterns() {
            Ok(patterns) => patterns,
            Err(e) => {
                eprintln!("[skill_learner] failed to load recent tool patterns: {e}");
                return None;
            }
        };

        // Find matching patterns across sessions
        let mut matching_sessions: Vec<String> = Vec::new();
        for (sid, sig) in &recent_patterns {
            if sid == session_id {
                continue;
            }
            if signatures_match(&current_sig, sig) {
                matching_sessions.push(sid.clone());
            }
        }

        // Include current session
        matching_sessions.push(session_id.to_string());

        if matching_sessions.len() < PATTERN_THRESHOLD {
            return None;
        }

        // Check if this skill already exists
        let skill_name = generate_skill_name(&current_sig);
        let learned_dir = home.join("skills").join("learned");
        let skill_path = learned_dir.join(format!("{}.md", skill_name));
        if skill_path.exists() {
            return None;
        }

        // Generate the skill
        let confidence =
            (matching_sessions.len() as f32 / recent_patterns.len().max(1) as f32).clamp(0.3, 1.0);

        let description = generate_description(&current_sig);
        let pattern = generate_pattern_markdown(&current_sig, tool_calls);

        Some(LearnedSkill {
            name: skill_name,
            description,
            pattern,
            confidence,
            source_sessions: matching_sessions,
        })
    }

    /// Save a learned skill to `~/.agiworkforce/skills/learned/`.
    pub fn save_skill(home: &Path, skill: &LearnedSkill) -> Result<()> {
        let learned_dir = home.join("skills").join("learned");
        fs::create_dir_all(&learned_dir)
            .context("Failed to create learned skills directory")?;

        // Enforce max learned skills
        prune_excess_skills(&learned_dir)?;

        let skill_path = learned_dir.join(format!("{}.md", skill.name));

        let sessions_yaml: Vec<String> = skill
            .source_sessions
            .iter()
            .map(|s| format!("\"{}\"", s))
            .collect();

        let content = format!(
            "---\n\
             name: {}\n\
             description: {}\n\
             auto_generated: true\n\
             confidence: {:.1}\n\
             source_sessions: [{}]\n\
             category: Learned Patterns\n\
             ---\n\n\
             {}\n",
            skill.name,
            skill.description,
            skill.confidence,
            sessions_yaml.join(", "),
            skill.pattern,
        );

        fs::write(&skill_path, content)
            .with_context(|| format!("Failed to write skill file: {}", skill_path.display()))?;

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tool signature types
// ---------------------------------------------------------------------------

/// A simplified tool usage signature: ordered list of tool names used.
type ToolSignature = Vec<String>;

/// Build a tool signature from tool call counts.
///
/// The signature is a sorted, deduplicated list of tool names. This captures
/// "which tools were used" rather than exact ordering, which is more stable
/// across sessions.
fn build_tool_signature(tool_calls: &[(String, u32)]) -> ToolSignature {
    let mut names: Vec<String> = tool_calls
        .iter()
        .filter(|(_, count)| *count > 0)
        .map(|(name, _)| name.clone())
        .collect();
    names.sort();
    names.dedup();
    names
}

/// Check if two tool signatures match (at least 70% overlap).
fn signatures_match(a: &ToolSignature, b: &ToolSignature) -> bool {
    if a.is_empty() || b.is_empty() {
        return false;
    }

    let common = a.iter().filter(|name| b.contains(name)).count();
    let max_len = a.len().max(b.len());
    let overlap = common as f64 / max_len as f64;

    overlap >= 0.7
}

// ---------------------------------------------------------------------------
// Database queries
// ---------------------------------------------------------------------------

/// Load tool usage patterns from recent sessions in the database.
///
/// Returns a list of `(session_id, tool_signature)` pairs.
fn load_recent_tool_patterns() -> Result<Vec<(String, ToolSignature)>> {
    let conn = sessions::open_db()?;

    let cutoff_ms = {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        now - (SESSION_LOOKBACK_DAYS * 24 * 3600 * 1000)
    };

    // Query: get tool usage per session for recent sessions
    let mut stmt = conn.prepare(
        "SELECT s.id, tc.tool_name, COUNT(tc.id) as call_count
         FROM sessions s
         JOIN messages m ON m.session_id = s.id
         JOIN tool_calls tc ON tc.message_id = m.id
         WHERE s.updated_at >= ?1
         GROUP BY s.id, tc.tool_name
         ORDER BY s.id, call_count DESC",
    )?;

    let rows = stmt.query_map(rusqlite::params![cutoff_ms], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
        ))
    })?;

    // Group by session_id
    let mut session_tools: HashMap<String, Vec<(String, u32)>> = HashMap::new();
    for row in rows {
        let (session_id, tool_name, count) = row?;
        session_tools
            .entry(session_id)
            .or_default()
            .push((tool_name, count as u32));
    }

    // Build signatures
    let patterns: Vec<(String, ToolSignature)> = session_tools
        .into_iter()
        .map(|(sid, tools)| {
            let sig = build_tool_signature(&tools);
            (sid, sig)
        })
        .collect();

    Ok(patterns)
}

// ---------------------------------------------------------------------------
// Skill generation helpers
// ---------------------------------------------------------------------------

/// Generate a skill name from a tool signature.
fn generate_skill_name(sig: &ToolSignature) -> String {
    if sig.is_empty() {
        return "auto-unknown-pattern".to_string();
    }

    // Use the first 3 tool names to create the skill name
    let parts: Vec<&str> = sig.iter().take(3).map(|s| s.as_str()).collect();
    let base = parts.join("-");

    // Normalize: replace underscores, limit length
    let normalized = base
        .replace('_', "-")
        .chars()
        .take(40)
        .collect::<String>();

    format!("auto-{}", normalized)
}

/// Generate a human-readable description from a tool signature.
fn generate_description(sig: &ToolSignature) -> String {
    if sig.is_empty() {
        return "Auto-detected usage pattern".to_string();
    }

    let tool_list = sig.join(", ");
    format!(
        "Automatically detected pattern using: {}",
        tool_list
    )
}

/// Generate the pattern body as markdown.
fn generate_pattern_markdown(sig: &ToolSignature, tool_calls: &[(String, u32)]) -> String {
    let mut md = String::new();

    md.push_str(&format!(
        "# Auto-detected: {} Pattern\n\n",
        categorize_pattern(sig)
    ));

    md.push_str("This skill was automatically generated from recurring tool usage patterns.\n\n");

    md.push_str("## Detected Workflow\n\n");

    // Build a step list based on tool usage
    let steps = build_workflow_steps(sig, tool_calls);
    for (i, step) in steps.iter().enumerate() {
        md.push_str(&format!("{}. {}\n", i + 1, step));
    }

    md.push_str("\n## Tools Used\n\n");
    for (name, count) in tool_calls {
        if *count > 0 {
            md.push_str(&format!("- `{}` ({} calls)\n", name, count));
        }
    }

    md
}

/// Categorize a pattern based on the tools used.
fn categorize_pattern(sig: &ToolSignature) -> &str {
    let has_build = sig.iter().any(|t| t == "run_command");
    let has_edit = sig.iter().any(|t| t == "edit_file" || t == "write_file");
    let has_read = sig.iter().any(|t| t == "read_file" || t == "search_files");
    let has_search = sig.iter().any(|t| t == "web_search" || t == "web_fetch");

    if has_edit && has_build {
        "Code Modification & Build"
    } else if has_edit && has_read {
        "Code Reading & Editing"
    } else if has_search {
        "Research & Analysis"
    } else if has_build {
        "Build & Validation"
    } else if has_read {
        "Code Analysis"
    } else {
        "General"
    }
}

/// Build workflow steps from the tool signature and usage counts.
fn build_workflow_steps(sig: &ToolSignature, tool_calls: &[(String, u32)]) -> Vec<String> {
    let mut steps = Vec::new();

    // Order by likely workflow sequence
    let workflow_order = [
        "read_file",
        "search_files",
        "list_directory",
        "grep_files",
        "web_search",
        "web_fetch",
        "edit_file",
        "write_file",
        "apply_patch",
        "run_command",
    ];

    for tool_name in &workflow_order {
        if sig.contains(&tool_name.to_string()) {
            let count = tool_calls
                .iter()
                .find(|(n, _)| n == tool_name)
                .map(|(_, c)| *c)
                .unwrap_or(0);

            let step = match *tool_name {
                "read_file" => format!("Read relevant files ({} reads)", count),
                "search_files" | "grep_files" => {
                    format!("Search codebase for relevant patterns ({} searches)", count)
                }
                "list_directory" => "Explore directory structure".to_string(),
                "web_search" => format!("Research online ({} searches)", count),
                "web_fetch" => "Fetch reference documentation".to_string(),
                "edit_file" => format!("Apply targeted edits ({} edits)", count),
                "write_file" => format!("Write new files ({} files)", count),
                "apply_patch" => "Apply patches to existing code".to_string(),
                "run_command" => format!("Run commands for validation ({} commands)", count),
                _ => format!("Use `{}` ({} calls)", tool_name, count),
            };
            steps.push(step);
        }
    }

    // Add any tools not in the standard workflow order
    for (name, count) in tool_calls {
        if *count > 0 && !workflow_order.contains(&name.as_str()) {
            steps.push(format!("Use `{}` ({} calls)", name, count));
        }
    }

    steps
}

/// Prune excess learned skill files (keep newest `MAX_LEARNED_SKILLS`).
fn prune_excess_skills(learned_dir: &Path) -> Result<()> {
    if !learned_dir.exists() {
        return Ok(());
    }

    let mut entries: Vec<_> = fs::read_dir(learned_dir)?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                == Some("md")
        })
        .collect();

    if entries.len() <= MAX_LEARNED_SKILLS {
        return Ok(());
    }

    // Sort by modification time (oldest first)
    entries.sort_by_key(|e| {
        e.metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
    });

    // Remove oldest entries beyond the limit
    let to_remove = entries.len() - MAX_LEARNED_SKILLS;
    for entry in entries.iter().take(to_remove) {
        let _ = fs::remove_file(entry.path());
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_tool_signature() {
        let calls = vec![
            ("read_file".to_string(), 3),
            ("edit_file".to_string(), 2),
            ("run_command".to_string(), 1),
        ];
        let sig = build_tool_signature(&calls);
        assert_eq!(sig, vec!["edit_file", "read_file", "run_command"]);
    }

    #[test]
    fn test_build_tool_signature_deduplicates() {
        let calls = vec![
            ("read_file".to_string(), 3),
            ("read_file".to_string(), 2),
        ];
        let sig = build_tool_signature(&calls);
        assert_eq!(sig, vec!["read_file"]);
    }

    #[test]
    fn test_signatures_match_identical() {
        let a = vec!["read_file".to_string(), "edit_file".to_string()];
        let b = vec!["read_file".to_string(), "edit_file".to_string()];
        assert!(signatures_match(&a, &b));
    }

    #[test]
    fn test_signatures_match_high_overlap() {
        let a = vec![
            "read_file".to_string(),
            "edit_file".to_string(),
            "run_command".to_string(),
        ];
        let b = vec![
            "read_file".to_string(),
            "edit_file".to_string(),
            "search_files".to_string(),
        ];
        // 2/3 overlap = 0.67, below 0.7 threshold
        assert!(!signatures_match(&a, &b));
    }

    #[test]
    fn test_signatures_match_empty() {
        let a: Vec<String> = vec![];
        let b = vec!["read_file".to_string()];
        assert!(!signatures_match(&a, &b));
    }

    #[test]
    fn test_generate_skill_name() {
        let sig = vec![
            "edit_file".to_string(),
            "read_file".to_string(),
            "run_command".to_string(),
        ];
        let name = generate_skill_name(&sig);
        assert!(name.starts_with("auto-"));
        assert!(name.contains("edit"));
    }

    #[test]
    fn test_generate_skill_name_empty() {
        let sig: Vec<String> = vec![];
        let name = generate_skill_name(&sig);
        assert_eq!(name, "auto-unknown-pattern");
    }

    #[test]
    fn test_categorize_pattern_code_modification() {
        let sig = vec!["edit_file".to_string(), "run_command".to_string()];
        assert_eq!(categorize_pattern(&sig), "Code Modification & Build");
    }

    #[test]
    fn test_categorize_pattern_research() {
        let sig = vec!["web_search".to_string(), "web_fetch".to_string()];
        assert_eq!(categorize_pattern(&sig), "Research & Analysis");
    }

    #[test]
    fn test_categorize_pattern_analysis() {
        let sig = vec!["read_file".to_string(), "search_files".to_string()];
        assert_eq!(categorize_pattern(&sig), "Code Analysis");
    }

    #[test]
    fn test_build_workflow_steps() {
        let sig = vec![
            "read_file".to_string(),
            "edit_file".to_string(),
            "run_command".to_string(),
        ];
        let calls = vec![
            ("read_file".to_string(), 5),
            ("edit_file".to_string(), 3),
            ("run_command".to_string(), 2),
        ];
        let steps = build_workflow_steps(&sig, &calls);
        assert_eq!(steps.len(), 3);
        assert!(steps[0].contains("Read relevant files"));
        assert!(steps[1].contains("Apply targeted edits"));
        assert!(steps[2].contains("Run commands"));
    }

    #[test]
    fn test_generate_description() {
        let sig = vec!["read_file".to_string(), "edit_file".to_string()];
        let desc = generate_description(&sig);
        assert!(desc.contains("read_file"));
        assert!(desc.contains("edit_file"));
    }

    #[test]
    fn test_analyze_session_too_few_calls() {
        let dir = tempfile::tempdir().unwrap();
        let calls = vec![("read_file".to_string(), 2)];
        let result = SkillLearner::analyze_session(dir.path(), "test-sess", &calls, true);
        assert!(result.is_none());
    }

    #[test]
    fn test_analyze_session_unsuccessful() {
        let dir = tempfile::tempdir().unwrap();
        let calls = vec![("read_file".to_string(), 10)];
        let result = SkillLearner::analyze_session(dir.path(), "test-sess", &calls, false);
        assert!(result.is_none());
    }

    #[test]
    fn test_save_skill() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        fs::create_dir_all(home.join("skills").join("learned")).unwrap();

        let skill = LearnedSkill {
            name: "auto-test-pattern".to_string(),
            description: "Test pattern".to_string(),
            pattern: "# Test\n\nDo things.".to_string(),
            confidence: 0.7,
            source_sessions: vec!["s1".to_string(), "s2".to_string(), "s3".to_string()],
        };

        let result = SkillLearner::save_skill(home, &skill);
        assert!(result.is_ok());

        let skill_path = home
            .join("skills")
            .join("learned")
            .join("auto-test-pattern.md");
        assert!(skill_path.exists());

        let content = fs::read_to_string(skill_path).unwrap();
        assert!(content.contains("name: auto-test-pattern"));
        assert!(content.contains("auto_generated: true"));
        assert!(content.contains("confidence: 0.7"));
        assert!(content.contains("Learned Patterns"));
        assert!(content.contains("s1"));
    }

    #[test]
    fn test_prune_excess_skills() {
        let dir = tempfile::tempdir().unwrap();
        let learned_dir = dir.path().join("learned");
        fs::create_dir_all(&learned_dir).unwrap();

        // Create more skills than MAX_LEARNED_SKILLS
        // Just verify it doesn't crash with a small set
        for i in 0..5 {
            fs::write(learned_dir.join(format!("skill-{}.md", i)), "content").unwrap();
        }

        let result = prune_excess_skills(&learned_dir);
        assert!(result.is_ok());
    }

    #[test]
    fn test_generate_pattern_markdown() {
        let sig = vec!["read_file".to_string(), "run_command".to_string()];
        let calls = vec![
            ("read_file".to_string(), 3),
            ("run_command".to_string(), 2),
        ];
        let md = generate_pattern_markdown(&sig, &calls);
        assert!(md.contains("Auto-detected"));
        assert!(md.contains("Detected Workflow"));
        assert!(md.contains("Tools Used"));
        assert!(md.contains("`read_file` (3 calls)"));
    }
}
