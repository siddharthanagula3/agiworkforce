//! Core types for the Research Mode module.
//!
//! This module defines the fundamental data structures used throughout
//! the research system.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use thiserror::Error;

/// Errors that can occur during research operations.
#[derive(Debug, Error)]
pub enum ResearchError {
    #[error("Research query is empty or invalid")]
    InvalidQuery,

    #[error("No search agents available for research")]
    NoAgentsAvailable,

    #[error("Research timeout after {0:?}")]
    Timeout(Duration),

    #[error("All search agents failed: {0}")]
    AllAgentsFailed(String),

    #[error("LLM error: {0}")]
    LlmError(String),

    #[error("Citation error: {0}")]
    CitationError(String),

    #[error("Report generation error: {0}")]
    ReportError(String),

    #[error("Agent error ({agent}): {message}")]
    AgentError { agent: String, message: String },

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<anyhow::Error> for ResearchError {
    fn from(err: anyhow::Error) -> Self {
        ResearchError::Internal(err.to_string())
    }
}

/// Research mode determines the depth and duration of research.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchMode {
    /// Quick search: 30 seconds - 2 minutes
    /// Single iteration, top results only
    Quick,

    /// Standard research: 2-10 minutes
    /// Multiple iterations, moderate depth
    #[default]
    Standard,

    /// Deep research: 5-30 minutes
    /// Comprehensive investigation, multiple angles
    Deep,

    /// Exhaustive research: 15-60 minutes
    /// Maximum depth, all available sources
    Exhaustive,
}

impl ResearchMode {
    /// Returns the typical duration range for this research mode.
    pub fn duration_range(&self) -> (Duration, Duration) {
        match self {
            ResearchMode::Quick => (Duration::from_secs(30), Duration::from_secs(120)),
            ResearchMode::Standard => (Duration::from_secs(120), Duration::from_secs(600)),
            ResearchMode::Deep => (Duration::from_secs(300), Duration::from_secs(1800)),
            ResearchMode::Exhaustive => (Duration::from_secs(900), Duration::from_secs(3600)),
        }
    }

    /// Returns the maximum number of search iterations for this mode.
    pub fn max_iterations(&self) -> usize {
        match self {
            ResearchMode::Quick => 1,
            ResearchMode::Standard => 3,
            ResearchMode::Deep => 5,
            ResearchMode::Exhaustive => 10,
        }
    }

    /// Returns the maximum number of sources per agent.
    pub fn max_sources_per_agent(&self) -> usize {
        match self {
            ResearchMode::Quick => 5,
            ResearchMode::Standard => 10,
            ResearchMode::Deep => 20,
            ResearchMode::Exhaustive => 50,
        }
    }

    /// Returns the absolute timeout for this research mode.
    pub fn timeout(&self) -> Duration {
        self.duration_range().1
    }
}

/// Configuration for the research system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchConfig {
    /// Default research mode
    pub default_mode: ResearchMode,

    /// Whether to enable web search
    pub enable_web_search: bool,

    /// Whether to enable document search
    pub enable_document_search: bool,

    /// Whether to enable email search
    pub enable_email_search: bool,

    /// Whether to enable calendar search
    pub enable_calendar_search: bool,

    /// Whether to enable memory search
    pub enable_memory_search: bool,

    /// Minimum confidence threshold for including results (0.0 - 1.0)
    pub min_confidence_threshold: f32,

    /// Maximum concurrent search agents
    pub max_concurrent_agents: usize,

    /// Whether to include confidence indicators in report
    pub show_confidence_indicators: bool,

    /// Whether to generate inline citations
    pub generate_inline_citations: bool,

    /// Custom LLM model for research synthesis (optional)
    pub synthesis_model: Option<String>,

    /// Custom LLM model for query analysis (optional)
    pub analysis_model: Option<String>,
}

impl Default for ResearchConfig {
    fn default() -> Self {
        Self {
            default_mode: ResearchMode::Standard,
            enable_web_search: true,
            enable_document_search: true,
            enable_email_search: true,
            enable_calendar_search: true,
            enable_memory_search: true,
            min_confidence_threshold: 0.3,
            max_concurrent_agents: 5,
            show_confidence_indicators: true,
            generate_inline_citations: true,
            synthesis_model: None,
            analysis_model: None,
        }
    }
}

/// A research query with analyzed intent and search strategies.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchQuery {
    /// The original user query
    pub original_query: String,

    /// Analyzed/refined version of the query
    pub refined_query: String,

    /// Key topics extracted from the query
    pub topics: Vec<String>,

    /// Related terms for expanding search
    pub related_terms: Vec<String>,

    /// Constraints or filters mentioned in the query
    pub constraints: Vec<String>,

    /// Time-related constraints (e.g., "last month", "2024")
    pub time_constraints: Option<TimeConstraint>,

    /// Generated search strategies
    pub strategies: Vec<SearchStrategy>,

    /// Research mode for this query
    pub mode: ResearchMode,

    /// Timestamp when query was created
    pub created_at: i64,
}

impl ResearchQuery {
    /// Creates a new research query from raw user input.
    pub fn new(query: &str, mode: ResearchMode) -> Self {
        Self {
            original_query: query.to_string(),
            refined_query: query.to_string(),
            topics: Vec::new(),
            related_terms: Vec::new(),
            constraints: Vec::new(),
            time_constraints: None,
            strategies: Vec::new(),
            mode,
            created_at: chrono::Utc::now().timestamp(),
        }
    }
}

/// Time constraints for filtering research results.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeConstraint {
    /// Start of the time range (Unix timestamp)
    pub from: Option<i64>,

    /// End of the time range (Unix timestamp)
    pub to: Option<i64>,

    /// Natural language description of the constraint
    pub description: String,
}

/// A search strategy defines how to search a particular source.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchStrategy {
    /// Unique identifier for this strategy
    pub id: String,

    /// Human-readable description
    pub description: String,

    /// The type of agent to use
    pub agent_type: AgentType,

    /// Specific search terms for this strategy
    pub search_terms: Vec<String>,

    /// Priority of this strategy (higher = more important)
    pub priority: u8,

    /// Expected relevance score (0.0 - 1.0)
    pub expected_relevance: f32,
}

/// Types of search agents available.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    WebSearch,
    DocumentSearch,
    EmailSearch,
    CalendarSearch,
    MemorySearch,
}

impl AgentType {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentType::WebSearch => "web_search",
            AgentType::DocumentSearch => "document_search",
            AgentType::EmailSearch => "email_search",
            AgentType::CalendarSearch => "calendar_search",
            AgentType::MemorySearch => "memory_search",
        }
    }
}

/// Confidence level for research findings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfidenceLevel {
    /// Very uncertain, multiple conflicting sources
    VeryLow,
    /// Some uncertainty, limited supporting evidence
    Low,
    /// Moderate confidence, reasonable evidence
    Medium,
    /// High confidence, strong evidence
    High,
    /// Very high confidence, multiple authoritative sources
    VeryHigh,
}

impl ConfidenceLevel {
    /// Returns a numeric score for this confidence level (0.0 - 1.0).
    pub fn score(&self) -> f32 {
        match self {
            ConfidenceLevel::VeryLow => 0.2,
            ConfidenceLevel::Low => 0.4,
            ConfidenceLevel::Medium => 0.6,
            ConfidenceLevel::High => 0.8,
            ConfidenceLevel::VeryHigh => 1.0,
        }
    }

    /// Creates a confidence level from a numeric score.
    pub fn from_score(score: f32) -> Self {
        if score >= 0.9 {
            ConfidenceLevel::VeryHigh
        } else if score >= 0.7 {
            ConfidenceLevel::High
        } else if score >= 0.5 {
            ConfidenceLevel::Medium
        } else if score >= 0.3 {
            ConfidenceLevel::Low
        } else {
            ConfidenceLevel::VeryLow
        }
    }

    /// Returns an emoji indicator for this confidence level.
    pub fn indicator(&self) -> &'static str {
        match self {
            ConfidenceLevel::VeryLow => "[?]",
            ConfidenceLevel::Low => "[~]",
            ConfidenceLevel::Medium => "[=]",
            ConfidenceLevel::High => "[+]",
            ConfidenceLevel::VeryHigh => "[!]",
        }
    }
}

/// Progress information for research operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchProgress {
    /// Unique research session ID
    pub session_id: String,

    /// Current phase of research
    pub phase: ResearchPhase,

    /// Overall progress percentage (0-100)
    pub progress_percent: u8,

    /// Current status message
    pub status_message: String,

    /// Number of sources found so far
    pub sources_found: usize,

    /// Number of search iterations completed
    pub iterations_completed: usize,

    /// Total iterations planned
    pub total_iterations: usize,

    /// Agents currently active
    pub active_agents: Vec<String>,

    /// Time elapsed since research started
    pub elapsed_secs: u64,

    /// Estimated time remaining (if known)
    pub estimated_remaining_secs: Option<u64>,

    /// Whether research has been cancelled
    pub cancelled: bool,
}

impl ResearchProgress {
    pub fn new(session_id: &str, total_iterations: usize) -> Self {
        Self {
            session_id: session_id.to_string(),
            phase: ResearchPhase::Initializing,
            progress_percent: 0,
            status_message: "Initializing research...".to_string(),
            sources_found: 0,
            iterations_completed: 0,
            total_iterations,
            active_agents: Vec::new(),
            elapsed_secs: 0,
            estimated_remaining_secs: None,
            cancelled: false,
        }
    }
}

/// Phases of the research process.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchPhase {
    /// Setting up the research session
    Initializing,
    /// Analyzing the query and generating strategies
    AnalyzingQuery,
    /// Actively searching across sources
    Searching,
    /// Collecting and deduplicating results
    CollectingResults,
    /// Synthesizing findings into coherent narrative
    Synthesizing,
    /// Generating the final report
    GeneratingReport,
    /// Research complete
    Complete,
    /// Research failed
    Failed,
    /// Research was cancelled
    Cancelled,
}

impl ResearchPhase {
    pub fn as_str(&self) -> &'static str {
        match self {
            ResearchPhase::Initializing => "initializing",
            ResearchPhase::AnalyzingQuery => "analyzing_query",
            ResearchPhase::Searching => "searching",
            ResearchPhase::CollectingResults => "collecting_results",
            ResearchPhase::Synthesizing => "synthesizing",
            ResearchPhase::GeneratingReport => "generating_report",
            ResearchPhase::Complete => "complete",
            ResearchPhase::Failed => "failed",
            ResearchPhase::Cancelled => "cancelled",
        }
    }
}

/// The final result of a research operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchResult {
    /// Unique session ID for this research
    pub session_id: String,

    /// The original query
    pub query: String,

    /// Research mode used
    pub mode: ResearchMode,

    /// The generated report (Markdown)
    pub report: String,

    /// Summary of findings (1-3 sentences)
    pub summary: String,

    /// Key findings as bullet points
    pub key_findings: Vec<String>,

    /// All citations used in the report
    pub citations: Vec<super::citation::Citation>,

    /// Overall confidence in the findings
    pub confidence: ConfidenceLevel,

    /// Metadata about the research process
    pub metadata: ResearchMetadata,

    /// Timestamp when research completed
    pub completed_at: i64,
}

/// Metadata about the research process.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResearchMetadata {
    /// Total time spent researching (in seconds)
    pub duration_secs: u64,

    /// Number of search iterations performed
    pub iterations: usize,

    /// Total sources examined
    pub sources_examined: usize,

    /// Sources included in final report
    pub sources_cited: usize,

    /// Breakdown of sources by type
    pub sources_by_type: HashMap<String, usize>,

    /// Agents that were used
    pub agents_used: Vec<String>,

    /// LLM tokens used (approximate)
    pub tokens_used: Option<u32>,

    /// Any warnings or notes about the research
    pub warnings: Vec<String>,
}
