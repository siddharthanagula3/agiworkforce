pub mod api_tools_impl;
pub mod audio_processing;
pub mod checkpoint;
pub mod checkpoint_manager;
pub mod checkpoint_store;
pub mod comparator;
pub mod context_manager;
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
pub use context_manager::{CompactionResult, CompactionStats, ContextManager};
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
    create_list_skills_tool, create_skill_use_tool, SkillTool, SkillToolInput, Tool,
    ToolCapability, ToolRegistry, ToolResult,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AGIConfig {
    pub max_concurrent_tools: usize,

    pub knowledge_memory_mb: u64,

    pub enable_learning: bool,

    pub enable_self_improvement: bool,

    pub resource_limits: ResourceLimits,

    pub max_planning_depth: usize,

    pub enable_multimodal: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    pub cpu_percent: f64,
    pub memory_mb: u64,
    pub network_mbps: f64,
    pub storage_mb: u64,
}

impl Default for AGIConfig {
    fn default() -> Self {
        Self {
            max_concurrent_tools: 10,
            knowledge_memory_mb: 1024,
            enable_learning: true,
            enable_self_improvement: true,
            resource_limits: ResourceLimits {
                cpu_percent: 80.0,
                memory_mb: 2048,
                network_mbps: 100.0,
                storage_mb: 10240,
            },
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
