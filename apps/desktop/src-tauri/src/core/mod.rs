pub mod agent;
pub mod agi;
pub mod artifacts;
pub mod embeddings;
pub mod llm;
pub mod mcp;
pub mod models;
pub mod research;
pub mod scheduler;
pub mod skills;
pub mod swarm;
pub mod sync_utils;

// Re-export scheduler types
pub use scheduler::nlp_parser::parse_schedule;
pub use scheduler::{ParseError, ParsedSchedule, SchedulerError, SchedulerResult};

// Re-export skills types
pub use skills::{
    RequirementCheckResult, Skill, SkillBuilder, SkillContextMode, SkillError, SkillInvocation,
    SkillLoader, SkillManager, SkillManagerConfig, SkillRequirements, SkillResult, SkillSource,
    SkillSourceFilter, SkillSourceType,
};

// Re-export research types
pub use research::{
    Citation, CitationFormat, CitationTracker, ConfidenceLevel, DocumentSearchAgent,
    MemorySearchAgent, ReportSection, ResearchConfig, ResearchError, ResearchMode,
    ResearchOrchestrator, ResearchProgress, ResearchQuery, ResearchReport, ResearchReportGenerator,
    ResearchResult, ResearchSession, SearchAgent, SearchAgentResult, SearchStrategy, SourceType,
    WebSearchAgent,
};

// Re-export swarm types for parallel execution
pub use swarm::{
    AgentSpawner, AggregatedResult, AggregationStrategy, DependencyGraph, ParallelizationHint,
    ResultAggregator, SpawnedAgent, SubAgentConfig, Subtask, SubtaskResult, SubtaskType,
    SwarmConfig, SwarmError, SwarmMetrics, SwarmOrchestrator, SwarmResult, SwarmStats,
    TaskDecomposer,
};
