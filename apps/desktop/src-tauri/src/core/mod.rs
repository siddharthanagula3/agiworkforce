pub mod agent;
pub mod agi;
pub mod artifacts;
pub mod codebase;
pub mod embeddings;
pub mod intent;
pub mod llm;
pub mod mcp;
pub mod models;
pub mod orchestration;
pub mod research;
pub mod scheduler;
pub mod skills;
pub mod swarm;
pub mod sync_utils;

// Re-export scheduler types
pub use scheduler::nlp_parser::parse_schedule;
pub use scheduler::{
    ActionHandler, CallbackAction, JobAction, JobExecution, JobInterval, JobSchedule, JobState,
    JobSummary, ParseError, ParsedSchedule, ProactiveScheduler, ScheduledJob, ScheduledJobBuilder,
    SchedulerError, SchedulerResult,
};

// Re-export skills types
pub use skills::{
    RequirementCheckResult, Skill, SkillBuilder, SkillContextMode, SkillError, SkillInvocation,
    SkillLoader, SkillManager, SkillManagerConfig, SkillRequirements, SkillResult, SkillSource,
    SkillSourceFilter, SkillSourceType, SlashCommand,
};

// Re-export research types
pub use research::{
    CalendarSearchAgent, Citation, CitationFormat, CitationTracker, ConfidenceLevel,
    DocumentSearchAgent, EmailSearchAgent, MemorySearchAgent, ReportSection, ResearchConfig,
    ResearchError, ResearchMode, ResearchOrchestrator, ResearchProgress, ResearchQuery,
    ResearchReport, ResearchReportGenerator, ResearchResult, ResearchSession, SearchAgent,
    SearchAgentResult, SearchStrategy, SourceType, WebSearchAgent,
};

// Re-export intent types
pub use intent::{
    Complexity, DetectedIntent, IntentCategory, IntentConfidence, IntentDetector,
    IntentDetectorConfig, IntentError, IntentPattern, IntentResult, OptimizationResult,
    PatternMatcher, QuickWinOptimizer, RequiredServer, RoutingPlan, ToolRouter, ToolRouterConfig,
    ToolSelection,
};

// Re-export swarm types for parallel execution
pub use swarm::{
    AgentSpawner, AggregatedResult, AggregationStrategy, DependencyGraph, ParallelizationHint,
    ResultAggregator, SpawnedAgent, SubAgentConfig, Subtask, SubtaskResult, SubtaskType,
    SwarmConfig, SwarmError, SwarmMetrics, SwarmOrchestrator, SwarmResult, SwarmStats,
    TaskDecomposer,
};
