//! Research Mode Module for AGI Workforce
//!
//! Inspired by Claude Desktop's research feature, this module provides
//! multi-source investigation capabilities with full citation tracking.
//!
//! ## Architecture
//!
//! The research system consists of:
//! - `ResearchOrchestrator`: Coordinates the entire research process
//! - `SearchAgent` variants: Specialized agents for different data sources
//! - `CitationTracker`: Manages source tracking and citation generation
//! - `ResearchReport`: Generates comprehensive Markdown reports
//!
//! ## Usage
//!
//! ```ignore
//! let orchestrator = ResearchOrchestrator::new(llm_router, config)?;
//! let report = orchestrator.research("What are the latest trends in AI?", ResearchMode::Deep).await?;
//! ```

pub mod agents;
pub mod citation;
pub mod orchestrator;
pub mod report;
pub mod types;

#[cfg(test)]
mod tests;

// Re-export main types for convenience
pub use agents::{
    CalendarSearchAgent, DocumentSearchAgent, EmailSearchAgent, MemorySearchAgent, SearchAgent,
    SearchAgentResult, WebSearchAgent,
};
pub use citation::{Citation, CitationFormat, CitationTracker, SourceType};
pub use orchestrator::{ResearchOrchestrator, ResearchSession};
pub use report::{ReportSection, ResearchReport, ResearchReportGenerator};
pub use types::{
    ConfidenceLevel, ResearchConfig, ResearchError, ResearchMode, ResearchProgress, ResearchQuery,
    ResearchResult, SearchStrategy,
};
