pub mod api_tools_impl;
pub mod audio_processing;
pub mod checkpoint;
pub mod checkpoint_manager;
pub mod checkpoint_store;
pub mod comparator;
pub mod conversation_summarizer;
pub mod core;
pub mod executor;
pub mod executors;
pub mod knowledge;
pub mod learning;
pub mod memory;
pub mod memory_manager;
pub mod memory_persistence;
pub mod orchestrator;
/// Example orchestrator configurations for reference and testing
// Used by: reference implementations and integration tests
pub mod orchestrator_examples;
pub mod outcome_tracker;
pub mod planner;
pub mod planner_memory_integration;
pub mod process_ontology;
pub mod process_reasoning;
pub mod project_memory;
pub mod reflection;
pub mod resources;
pub mod sandbox;
pub mod semantic_search;
pub mod templates;
pub mod tools;

#[cfg(test)]
mod tests;

pub use checkpoint::{
    Checkpoint, CheckpointConfig, CheckpointContextEntry, CheckpointId, CheckpointListResponse,
    CheckpointMetadata, CheckpointReason, CheckpointSummary, CreateCheckpointRequest,
    ResumableExecution, TaskId,
};
pub use checkpoint_manager::{CheckpointManager, CheckpointedExecution, ExecutionMetrics};
pub use checkpoint_store::CheckpointStore;
pub use comparator::{ExecutionResult, ResultComparator, ScoredResult};
pub use conversation_summarizer::{
    ConversationSummarizer, ExtractedMemory, ExtractionResult, HttpSummaryLLM, SummarizationRun,
    SummarizationStatus, SummaryLLM, DEFAULT_EXTRACTION_PROMPT,
};
pub use core::AGICore;
pub use executor::AGIExecutor;
pub use knowledge::KnowledgeBase;
pub use learning::LearningSystem;
#[allow(deprecated)]
pub use memory::AGIMemory;
pub use memory_manager::{
    DailyLogEntry, DecayCandidate, DecayConfig, DecayResult, LogEntryType, MemoryCategory,
    MemoryEntry, MemoryManager, MemoryStats,
};
pub use memory_persistence::MemoryCategory as PersistentMemoryCategory;
pub use memory_persistence::{
    ConversationSummaryCandidate, HybridSearchResult, ImportResult, MemoryExport, MemoryStore,
    PersistentMemory, SearchFilter, SummarizationStats, SummarizerConfig, DEFAULT_EMBEDDING_DIM,
    FTS_SEARCH_WEIGHT, MAX_CONTENT_LENGTH_BEFORE_SUMMARY, SUMMARIZATION_INTERVAL_HOURS,
    VECTOR_SEARCH_WEIGHT,
};
pub use orchestrator::{
    AgentOrchestrator, AgentResult, AgentState, AgentStatus, CoordinationPattern, FileGuard,
    ResourceLock, UiGuard,
};
pub use outcome_tracker::{OutcomeTracker, ProcessSuccessRate, TrackedOutcome};
pub use planner::AGIPlanner;
pub use process_ontology::{ProcessOntology, ProcessTemplate};
pub use process_reasoning::{Outcome, OutcomeScore, ProcessReasoning, ProcessType, Strategy};
pub use project_memory::{
    ArchitecturalDecision, CodingStyle, ProjectContext, ProjectMemory, ProjectMemoryManager,
    ProjectMemoryType,
};
pub use reflection::{
    Correction, CorrectionType, ExecutionAssessment, FailedStep, FailureCategory, FailurePattern,
    PlanCritique, PlanRisk, ReflectionEngine, ReflectionInsight, SubGoal,
};
pub use resources::ResourceManager;
pub use sandbox::{CodeExecutionResult, ExecutionConfig, Sandbox, SandboxManager};
pub use semantic_search::{IndexStats, SemanticSearchConfig, SemanticSearchResult, TfIdfIndex};
pub use templates::{
    get_builtin_templates, AgentTemplate, DifficultyLevel, TemplateCategory, TemplateManager,
    WorkflowDefinition, WorkflowStep,
};
pub use tools::{
    SkillTool, SkillToolInput, Tool, ToolCapability, ToolRegistry, ToolResult, SKILL_TOOL_ID,
};

// Export the new modular executor architecture
pub use executors::{
    ApiExecutor, BrowserExecutor, CalendarExecutor, CloudExecutor, CodeExecutor, DatabaseExecutor,
    EmailExecutor, ExecutorContext, ExecutorRegistry, FileExecutor, GitExecutor, LlmExecutor,
    McpExecutor, McpExecutorExt, McpExecutorStats, McpToolResult, OcrExecutor, OutcomeExecutor,
    OutcomeMeasurement, OutcomeSummary, ProductivityExecutor, SearchExecutor, TerminalExecutor,
    ToolExecutor, UiExecutor,
};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Largest index `<= max` that lies on a UTF-8 char boundary of `s`.
///
/// `&s[..floor_char_boundary(s, n)]` never panics on multibyte input — unlike a
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
#[serde(default, rename_all = "camelCase")]
pub struct AGIConfig {
    #[serde(alias = "max_concurrent_tools")]
    pub max_concurrent_tools: usize,

    #[serde(alias = "knowledge_memory_mb")]
    pub knowledge_memory_mb: u64,

    #[serde(alias = "enable_learning")]
    pub enable_learning: bool,

    #[serde(alias = "enable_self_improvement")]
    pub enable_self_improvement: bool,

    #[serde(alias = "resource_limits")]
    pub resource_limits: ResourceLimits,

    #[serde(alias = "max_planning_depth")]
    pub max_planning_depth: usize,

    #[serde(alias = "enable_multimodal")]
    pub enable_multimodal: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ResourceLimits {
    #[serde(alias = "cpu_percent")]
    pub cpu_percent: f64,
    #[serde(alias = "memory_mb")]
    pub memory_mb: u64,
    #[serde(alias = "network_mbps")]
    pub network_mbps: f64,
    #[serde(alias = "storage_mb")]
    pub storage_mb: u64,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            cpu_percent: 80.0,
            memory_mb: 2048,
            network_mbps: 100.0,
            storage_mb: 10240,
        }
    }
}

impl Default for AGIConfig {
    fn default() -> Self {
        Self {
            max_concurrent_tools: 10,
            knowledge_memory_mb: 1024,
            enable_learning: true,
            enable_self_improvement: true,
            resource_limits: ResourceLimits::default(),
            max_planning_depth: 20,
            enable_multimodal: true,
        }
    }
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
    /// `RouterPreferences` built while planning/executing this goal (see
    /// `core/agi/planner.rs`, `process_reasoning.rs`, and the
    /// `core/agi/executors/*` tool executors) so `LLMRouter::candidates`
    /// enforces Local/BYOK/ManagedCloud instead of falling through to its
    /// fail-closed Local default. `None` still fails closed to Local via
    /// `llm_router::effective_trust_mode` — this field does not itself
    /// default to `Local`; the router does that.
    #[serde(default)]
    pub trust_mode: Option<agiworkforce_model_registry::TrustMode>,
}

impl Goal {
    /// Returns the model/provider pair admitted by the privileged submission
    /// boundary. Existing checkpoints and non-UI callers may omit it; callers
    /// must never infer a provider from a dynamic model name.
    pub fn execution_target(&self) -> Option<(&str, &str)> {
        let mut model = None;
        let mut provider = None;
        for constraint in &self.constraints {
            if let ConstraintValue::Custom { key, value } = &constraint.value {
                match key.as_str() {
                    "execution_model" => model = Some(value.as_str()),
                    "execution_provider" => provider = Some(value.as_str()),
                    _ => {}
                }
            }
        }
        model.zip(provider)
    }
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AGICapabilities {
    pub can_read_files: bool,
    pub can_write_files: bool,
    pub can_execute_code: bool,
    pub can_automate_ui: bool,
    pub can_use_browser: bool,
    pub can_access_databases: bool,
    pub can_make_api_calls: bool,
    pub can_process_images: bool,
    pub can_process_audio: bool,
    pub can_understand_code: bool,
    pub can_learn_from_experience: bool,
    pub can_plan_complex_tasks: bool,
    pub can_adapt_strategies: bool,
}

impl Default for AGICapabilities {
    fn default() -> Self {
        Self {
            can_read_files: true,
            can_write_files: true,
            can_execute_code: true,
            can_automate_ui: true,
            can_use_browser: true,
            can_access_databases: true,
            can_make_api_calls: true,
            can_process_images: true,
            can_process_audio: true,
            can_understand_code: true,
            can_learn_from_experience: true,
            can_plan_complex_tasks: true,
            can_adapt_strategies: true,
        }
    }
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
    // Multibyte regression tests — verifies every call-site length that
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
        // file_ops.rs:1394 — &content[..500]
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
        // git_executor.rs:850 — &diff_content[..10000]
        let diff = "日本語テスト\n".repeat(800); // > 10000 bytes
        assert_char_safe(&diff, 10000);
    }

    #[test]
    fn multibyte_code_generator_cap_2000() {
        // code_generator.rs:187,357 — &content[..2000]
        let code = "🦀".repeat(600); // 600 * 4 = 2400 bytes > 2000
        assert_char_safe(&code, 2000);
        let end = floor_char_boundary(&code, 2000);
        // 🦀 is 4 bytes; byte 2000 falls mid-codepoint → should snap back to 1999 or 1996
        assert_eq!(end % 4, 0);
    }

    #[test]
    fn multibyte_hooks_event_cap_497() {
        // hooks/event.rs:327 — &prompt_str[..497]
        let prompt = "你好世界".repeat(100); // each char is 3 bytes, 400 chars = 1200 bytes
        assert_char_safe(&prompt, 497);
        let end = floor_char_boundary(&prompt, 497);
        assert_eq!(end % 3, 0, "CJK chars are 3 bytes");
    }

    #[test]
    fn multibyte_tool_confirmation_cap_47() {
        // tool_confirmation.rs:540 — &s[..47]
        let s = "こんにちは世界！".repeat(10); // 3 bytes/char
        assert_char_safe(&s, 47);
    }

    #[test]
    fn multibyte_db_tools_cap_200() {
        // db_tools.rs:203, database.rs:233 — &query[..200]
        let query = "SELECT * FROM テーブル WHERE カラム = ?".repeat(5);
        assert_char_safe(&query, 200);
    }

    #[test]
    fn multibyte_browser_cap_200() {
        // browser.rs:43 — &script[..200]
        let script = "document.title = '🌐'.repeat(100);".repeat(3);
        assert_char_safe(&script, 200);
    }

    #[test]
    fn multibyte_tool_executor_mod_cap_27() {
        // tool_executor/mod.rs:2020 — &s[..27]
        let s = "参数值🔑".repeat(10);
        assert_char_safe(&s, 27);
    }

    #[test]
    fn multibyte_computer_use_type_cap_50() {
        // computer_use/types.rs:320 — &text[..50]
        let text = "🖥️タイプ入力テスト".repeat(5);
        assert_char_safe(&text, 50);
    }

    #[test]
    fn multibyte_file_tools_cap_200000() {
        // file_tools.rs:86,132 — &content[..FILE_READ_MAX_CHARS]
        // use smaller proxy cap (200) to keep test fast
        let content = "🗃️".repeat(60); // 4 bytes each
        assert_char_safe(&content, 200);
    }

    #[test]
    fn multibyte_test_runner_cap_65536() {
        // test_runner.rs:856 — &raw[..MAX_OUTPUT_BYTES] (64 KiB)
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

        // Pattern: &<ident>[..<digits>] anywhere on a line — simplified grep.
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
            "Found {} unmarked bare-integer str-slice(s) — wrap with \
             floor_char_boundary or add `// utf8-safe:` if the value is \
             guaranteed ASCII/hex:\n{}",
            violations.len(),
            violations.join("\n")
        );
    }
}
