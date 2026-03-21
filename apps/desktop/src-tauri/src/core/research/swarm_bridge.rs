//! Bridge layer between the Research orchestrator and the Swarm system.
//!
//! Converts research types (SearchStrategy, AgentResult) to/from swarm types
//! (DependencyGraph, SubtaskResult) so the research module can leverage the
//! swarm's parallel execution infrastructure.

use super::agents::{SearchAgentResult, SearchResult};
use super::types::{AgentType, ResearchMode, SearchStrategy};
use crate::core::swarm::{
    result_aggregator::SubtaskResult,
    task_decomposer::{DependencyGraph, ParallelizationHint, Subtask, SubtaskType},
    SubtaskPriority,
};

/// Marker prefix used to identify research subtasks inside the swarm spawner.
/// When `AgentSpawner::execute_subtask` sees a description starting with this
/// prefix it routes to the lightweight research executor instead of spinning
/// up a full AGICore instance.
pub const RESEARCH_SUBTASK_PREFIX: &str = "[research_subtask]";

/// Converts a list of [`SearchStrategy`] into a [`DependencyGraph`] where every
/// strategy becomes an independent (no dependencies) subtask suitable for fully
/// parallel execution by the swarm.
pub fn strategies_to_dependency_graph(
    strategies: &[SearchStrategy],
    query: &str,
    mode: &ResearchMode,
) -> DependencyGraph {
    let goal_id = format!("research_{}", uuid::Uuid::new_v4());
    let mut graph = DependencyGraph::new();

    for strategy in strategies {
        let description = format!(
            "{} agent_type={} search_terms={} query={}",
            RESEARCH_SUBTASK_PREFIX,
            strategy.agent_type.as_str(),
            strategy.search_terms.join(","),
            query,
        );

        let mut subtask = Subtask::new(
            strategy.id.clone(),
            description,
            SubtaskType::NetworkRequest,
            goal_id.clone(),
        );

        // All research strategies are independent — no dependencies
        subtask.dependencies = Vec::new();

        // Map priority from the strategy (1-10 scale) to swarm priority
        subtask.priority = match strategy.priority {
            0..=3 => SubtaskPriority::Low,
            4..=6 => SubtaskPriority::Normal,
            7..=8 => SubtaskPriority::High,
            _ => SubtaskPriority::Critical,
        };

        subtask.parallelization = ParallelizationHint {
            parallelizable: true,
            estimated_duration_ms: match mode {
                ResearchMode::Quick => 2_000,
                ResearchMode::Standard => 5_000,
                ResearchMode::Deep => 10_000,
                ResearchMode::Exhaustive => 15_000,
            },
            resource_intensity: 0.3,
            has_side_effects: false,
            suggested_parallelism: mode.recommended_max_agents(),
        };

        // Attach strategy metadata as parameters so the lightweight executor
        // can reconstruct the search request.
        subtask.parameters = serde_json::json!({
            "agent_type": strategy.agent_type.as_str(),
            "search_terms": strategy.search_terms,
            "expected_relevance": strategy.expected_relevance,
            "strategy_description": strategy.description,
        });

        graph.add_subtask(subtask);
    }

    graph
}

/// Converts swarm [`SubtaskResult`] values back into research
/// [`SearchAgentResult`] values that the research orchestrator understands.
pub fn swarm_results_to_agent_results(results: Vec<SubtaskResult>) -> Vec<SearchAgentResult> {
    results
        .into_iter()
        .map(|sr| {
            if sr.success {
                // Try to reconstruct search results from the output JSON
                let (agent_type, search_results) = parse_subtask_output(&sr);
                SearchAgentResult {
                    agent_type,
                    results: search_results,
                    search_time_ms: sr.execution_time.as_millis() as u64,
                    warnings: Vec::new(),
                    complete: true,
                    error: None,
                }
            } else {
                // Failed subtask — produce a failed SearchAgentResult
                let agent_type = parse_agent_type_from_subtask_id(&sr.subtask_id);
                SearchAgentResult::failed(
                    agent_type,
                    sr.error.as_deref().unwrap_or("Unknown swarm subtask error"),
                )
            }
        })
        .collect()
}

/// Formats a research query and mode into a goal description string
/// suitable for the swarm orchestrator.
pub fn research_query_to_goal(query: &str, mode: &ResearchMode) -> String {
    let mode_label = match mode {
        ResearchMode::Quick => "quick",
        ResearchMode::Standard => "standard",
        ResearchMode::Deep => "deep",
        ResearchMode::Exhaustive => "exhaustive",
    };
    format!(
        "[research] mode={} query={}",
        mode_label,
        query,
    )
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Parses the JSON output of a successful research subtask into an
/// `(AgentType, Vec<SearchResult>)` pair.
fn parse_subtask_output(result: &SubtaskResult) -> (AgentType, Vec<SearchResult>) {
    let default_type = parse_agent_type_from_subtask_id(&result.subtask_id);

    let output = match &result.output {
        Some(v) => v,
        None => return (default_type, Vec::new()),
    };

    // The lightweight research executor stores results under "search_results"
    let search_results: Vec<SearchResult> = output
        .get("search_results")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let agent_type = output
        .get("agent_type")
        .and_then(|v| v.as_str())
        .map(parse_agent_type_str)
        .unwrap_or(default_type);

    (agent_type, search_results)
}

fn parse_agent_type_from_subtask_id(id: &str) -> AgentType {
    // Strategy IDs are formatted like "strategy_0", but the subtask parameters
    // carry the real agent_type. Fall back to WebSearch if we cannot determine.
    if id.contains("document") {
        AgentType::DocumentSearch
    } else if id.contains("email") {
        AgentType::EmailSearch
    } else if id.contains("calendar") {
        AgentType::CalendarSearch
    } else if id.contains("memory") {
        AgentType::MemorySearch
    } else {
        AgentType::WebSearch
    }
}

fn parse_agent_type_str(s: &str) -> AgentType {
    match s {
        "web_search" => AgentType::WebSearch,
        "document_search" => AgentType::DocumentSearch,
        "email_search" => AgentType::EmailSearch,
        "calendar_search" => AgentType::CalendarSearch,
        "memory_search" => AgentType::MemorySearch,
        _ => AgentType::WebSearch,
    }
}
