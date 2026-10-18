pub mod api_tools_impl;
pub mod conversation_summarizer;
pub mod executors;
pub mod knowledge;
pub mod memory_manager;
pub mod project_memory;
pub mod sandbox;
pub mod semantic_search;
pub mod tools;

pub use conversation_summarizer::{ConversationSummarizer, SummarizationOutcome};
pub use knowledge::KnowledgeBase;
pub use memory_manager::{
    DailyLogEntry, DecayCandidate, DecayConfig, DecayResult, LogEntryType, MemoryCategory,
    MemoryEntry, MemoryManager, MemoryStats,
};
pub use project_memory::{
    ArchitecturalDecision, ProjectMemory, ProjectMemoryManager, ProjectMemoryType,
};
pub use sandbox::{CodeExecutionResult, ExecutionConfig, Sandbox, SandboxManager};
pub use semantic_search::{IndexStats, SemanticSearchConfig, SemanticSearchResult, TfIdfIndex};
pub use tools::{
    SkillTool, SkillToolInput, Tool, ToolCapability, ToolRegistry, ToolResult, SKILL_TOOL_ID,
};

pub use executors::{
    ApiExecutor, BrowserExecutor, ExecutorContext, SearchExecutor, ToolExecutor, UiExecutor,
};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Largest index `<= max` that lies on a UTF-8 char boundary of `s`.
///
/// `&s[..floor_char_boundary(s, n)]` never panics on multibyte input, unlike a
/// raw `&s[..n]`, which panics when byte `n` splits a codepoint. Returns
/// `s.len()` when `max >= s.len()`. Mirrors the (still-unstable) std
/// `str::floor_char_boundary`.
pub(crate) fn floor_char_boundary(s: &str, max: usize) -> usize {
    if max >= s.len() {
        return s.len();
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    end
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Goal {
    pub id: String,
    pub description: String,
    pub priority: Priority,
    pub deadline: Option<u64>,
    pub constraints: Vec<Constraint>,
    pub success_criteria: Vec<String>,
    /// TRUST BOUNDARY (desktop-trust-boundary-01): the active session's
    /// execution boundary at goal-submission time. Threaded into every
    /// `RouterPreferences` the `core/agi/executors/*` tool executors build,
    /// so `LLMRouter::candidates`
    /// enforces Local/BYOK/ManagedCloud instead of falling through to its
    /// fail-closed Local default. `None` still fails closed to Local via
    /// `llm_router::effective_trust_mode`, this field does not itself
    /// default to `Local`; the router does that.
    #[serde(default)]
    pub trust_mode: Option<agiworkforce_model_registry::TrustMode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum Priority {
    Low = 1,
    Medium = 2,
    High = 3,
    Critical = 4,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Constraint {
    pub name: String,
    pub value: ConstraintValue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConstraintValue {
    ResourceLimit { resource: String, limit: f64 },
    TimeLimit { seconds: u64 },
    QualityThreshold { metric: String, threshold: f64 },
    Custom { key: String, value: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionContext {
    pub goal: Goal,
    pub current_state: HashMap<String, serde_json::Value>,
    pub available_resources: ResourceState,
    pub tool_results: Vec<ToolExecutionResult>,
    pub context_memory: Vec<ContextEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceState {
    pub cpu_usage_percent: f64,
    pub memory_usage_mb: u64,
    pub network_usage_mbps: f64,
    pub storage_usage_mb: u64,
    pub available_tools: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecutionResult {
    pub tool_id: String,
    #[serde(default)]
    pub step_id: String,
    pub success: bool,
    pub result: serde_json::Value,
    pub error: Option<String>,
    pub execution_time_ms: u64,
    pub resources_used: ResourceUsage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceUsage {
    pub cpu_percent: f64,
    pub memory_mb: u64,
    pub network_mb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextEntry {
    pub timestamp: u64,
    pub event: String,
    pub data: serde_json::Value,
}

#[cfg(test)]
mod char_boundary_tests {
    use super::floor_char_boundary;

    #[test]
    fn snaps_back_from_a_multibyte_split() {
        let s = "é"; // U+00E9 = 2 bytes, 1 char
        assert_eq!(floor_char_boundary(s, 1), 0); // byte 1 splits the codepoint
        assert_eq!(floor_char_boundary(s, 2), 2);
        assert_eq!(floor_char_boundary(s, 99), 2); // caps at len
    }

    #[test]
    fn never_panics_when_index_lands_inside_a_codepoint() {
        let s = "a".repeat(99) + "🚀"; // 99 ASCII + 4-byte emoji = 103 bytes
        let end = floor_char_boundary(&s, 100); // byte 100 is inside the emoji
        assert_eq!(end, 99);
        assert!(s.is_char_boundary(end));
        let _ = &s[..end]; // must not panic
    }

    #[test]
    fn ascii_is_identity() {
        assert_eq!(floor_char_boundary("hello world", 5), 5);
    }

    // ------------------------------------------------------------------
    // Multibyte regression tests, verifies every call-site length that
    // was previously a raw byte-slice.  Each test feeds emoji / CJK input
    // whose byte length exceeds the cap and asserts no panic + char-safe
    // truncation (result is always a valid &str, boundary is verified).
    // ------------------------------------------------------------------

    fn assert_char_safe(s: &str, cap: usize) {
        let end = floor_char_boundary(s, cap);
        assert!(
            s.is_char_boundary(end),
            "floor_char_boundary({cap}) returned {end} which is not a char boundary"
        );
        let _slice = &s[..end]; // must not panic
        assert!(end <= cap, "floor_char_boundary must not exceed cap");
        assert!(end <= s.len(), "floor_char_boundary must not exceed len");
    }

    #[test]
    fn multibyte_file_ops_cap_500() {
        // file_ops.rs:1394, &content[..500]
        let content = "👍".repeat(200); // 200 * 4 bytes = 800 bytes > 500
        assert_char_safe(&content, 500);
        let end = floor_char_boundary(&content, 500);
        assert_eq!(
            end % 4,
            0,
            "emoji is 4 bytes; boundary must be 4-byte aligned"
        );
    }

    #[test]
    fn multibyte_git_diff_cap_10000() {
        // git_executor.rs:850, &diff_content[..10000]
        let diff = "日本語テスト\n".repeat(800); // > 10000 bytes
        assert_char_safe(&diff, 10000);
    }

    #[test]
    fn multibyte_content_cap_2000() {
        let code = "🦀".repeat(600); // 600 * 4 = 2400 bytes > 2000
        assert_char_safe(&code, 2000);
        let end = floor_char_boundary(&code, 2000);
        // 🦀 is 4 bytes; byte 2000 falls mid-codepoint → should snap back to 1999 or 1996
        assert_eq!(end % 4, 0);
    }

    #[test]
    fn multibyte_hooks_event_cap_497() {
        // hooks/event.rs:327, &prompt_str[..497]
        let prompt = "你好世界".repeat(100); // each char is 3 bytes, 400 chars = 1200 bytes
        assert_char_safe(&prompt, 497);
        let end = floor_char_boundary(&prompt, 497);
        assert_eq!(end % 3, 0, "CJK chars are 3 bytes");
    }

    #[test]
    fn multibyte_tool_confirmation_cap_47() {
        // tool_confirmation.rs:540, &s[..47]
        let s = "こんにちは世界！".repeat(10); // 3 bytes/char
        assert_char_safe(&s, 47);
    }

    #[test]
    fn multibyte_db_tools_cap_200() {
        // db_tools.rs:203, database.rs:233, &query[..200]
        let query = "SELECT * FROM テーブル WHERE カラム = ?".repeat(5);
        assert_char_safe(&query, 200);
    }

    #[test]
    fn multibyte_browser_cap_200() {
        // browser.rs:43, &script[..200]
        let script = "document.title = '🌐'.repeat(100);".repeat(3);
        assert_char_safe(&script, 200);
    }

    #[test]
    fn multibyte_tool_executor_mod_cap_27() {
        // tool_executor/mod.rs:2020, &s[..27]
        let s = "参数值🔑".repeat(10);
        assert_char_safe(&s, 27);
    }

    #[test]
    fn multibyte_computer_use_type_cap_50() {
        // computer_use/types.rs:320, &text[..50]
        let text = "🖥️タイプ入力テスト".repeat(5);
        assert_char_safe(&text, 50);
    }

    #[test]
    fn multibyte_file_tools_cap_200000() {
        // file_tools.rs:86,132, &content[..FILE_READ_MAX_CHARS]
        // use smaller proxy cap (200) to keep test fast
        let content = "🗃️".repeat(60); // 4 bytes each
        assert_char_safe(&content, 200);
    }

    #[test]
    fn multibyte_test_runner_cap_65536() {
        // test_runner.rs:856, &raw[..MAX_OUTPUT_BYTES] (64 KiB)
        // use smaller proxy (500) to keep test fast; logic is identical
        let raw = "✅".repeat(200); // 3 bytes each = 600 bytes > 500
        assert_char_safe(&raw, 500);
    }

    // ------------------------------------------------------------------
    // Source-invariant guard: no unmarked raw `&<ident>[..<integer>]`
    // byte-slices on &str/String in src-tauri/src.
    //
    // Rule: after this fix, every remaining literal-integer slice on a
    // &str value either:
    //   (a) uses floor_char_boundary(…) as its bound (no bare integer), or
    //   (b) is on a hex/uuid/ascii value and carries a `// utf8-safe:` comment
    //       on the same source line.
    //
    // The guard below counts unmarked bare-integer str-slices. It MUST be 0.
    // If you re-introduce `&foo[..500]` without a `// utf8-safe:` comment the
    // count rises above 0 and this test fails.
    // ------------------------------------------------------------------
    #[test]
    fn guard_no_unmarked_bare_integer_str_slices() {
        use std::path::Path;

        // Resolve src dir relative to this file's manifest dir.
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let src_dir = Path::new(manifest_dir).join("src");

        // Pattern: &<ident>[..<digits>] anywhere on a line, simplified grep.
        // We match lines that contain `&` followed by ident chars, then `[..` then digits then `]`.
        let dangerous_re =
            regex::Regex::new(r"&[a-zA-Z_][a-zA-Z0-9_.]*\[\.\.\s*[0-9]+\s*\]").unwrap();

        let mut violations: Vec<String> = Vec::new();

        // Walk all .rs files under src/
        fn walk(dir: &Path, dangerous_re: &regex::Regex, violations: &mut Vec<String>) {
            let entries = match std::fs::read_dir(dir) {
                Ok(e) => e,
                Err(_) => return,
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk(&path, dangerous_re, violations);
                } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
                    let Ok(content) = std::fs::read_to_string(&path) else {
                        continue;
                    };
                    for (line_no, line) in content.lines().enumerate() {
                        // Skip comment-only lines.
                        let trimmed = line.trim_start();
                        if trimmed.starts_with("//") {
                            continue;
                        }
                        if dangerous_re.is_match(line) {
                            // Allowed if the same line carries a `// utf8-safe:` annotation
                            // OR lives inside the floor_char_boundary implementation itself
                            // (the helper's one `&s[..end]` in core/agi/mod.rs is safe by construction).
                            let is_annotated = line.contains("// utf8-safe:");
                            let is_guard_file = path
                                .to_str()
                                .map(|p| p.contains("core/agi/mod.rs"))
                                .unwrap_or(false);
                            if !is_annotated && !is_guard_file {
                                violations.push(format!(
                                    "{}:{}: {}",
                                    path.display(),
                                    line_no + 1,
                                    line.trim()
                                ));
                            }
                        }
                    }
                }
            }
        }

        walk(&src_dir, &dangerous_re, &mut violations);

        assert!(
            violations.is_empty(),
            "Found {} unmarked bare-integer str-slice(s), wrap with \
             floor_char_boundary or add `// utf8-safe:` if the value is \
             guaranteed ASCII/hex:\n{}",
            violations.len(),
            violations.join("\n")
        );
    }
}
