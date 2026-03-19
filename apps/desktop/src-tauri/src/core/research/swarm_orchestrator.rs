//! ResearchSwarmOrchestrator — thin wrapper that drives the swarm system
//! for research-mode parallel execution.
//!
//! Instead of sequentially looping through search strategies, this module
//! converts strategies into a swarm dependency graph (all-parallel) and
//! lets the [`SwarmOrchestrator`] execute them concurrently with up to 100
//! agents.

use super::agents::SearchAgentResult;
use super::swarm_bridge;
use super::types::{ResearchError, ResearchMode, SearchStrategy};
use crate::core::swarm::orchestrator::SwarmOrchestrator;
use std::sync::Arc;

/// Wraps a [`SwarmOrchestrator`] and exposes a research-specific API.
#[allow(dead_code)]
pub struct ResearchSwarmOrchestrator {
    swarm: Arc<SwarmOrchestrator>,
}

impl ResearchSwarmOrchestrator {
    /// Creates a new research swarm orchestrator backed by the given swarm.
    #[allow(dead_code)]
    pub fn new(swarm: Arc<SwarmOrchestrator>) -> Self {
        Self { swarm }
    }

    /// Executes a set of search strategies in parallel via the swarm system.
    ///
    /// 1. Converts strategies into a [`DependencyGraph`] (all independent).
    /// 2. Calls [`SwarmOrchestrator::execute_with_graph`] for direct parallel
    ///    execution, skipping the LLM decomposition step.
    /// 3. Converts swarm results back into [`SearchAgentResult`] values.
    ///
    /// On failure the caller should fall back to sequential execution.
    #[allow(dead_code)]
    pub async fn execute_strategies(
        &self,
        strategies: Vec<SearchStrategy>,
        query: &str,
        mode: &ResearchMode,
    ) -> Result<Vec<SearchAgentResult>, ResearchError> {
        if strategies.is_empty() {
            return Ok(Vec::new());
        }

        tracing::info!(
            "[ResearchSwarm] Executing {} strategies in parallel (mode={:?})",
            strategies.len(),
            mode,
        );

        // Build the dependency graph from research strategies
        let graph = swarm_bridge::strategies_to_dependency_graph(&strategies, query, mode);

        // Build the goal string
        let goal = swarm_bridge::research_query_to_goal(query, mode);

        // Execute via the swarm with the pre-built graph
        let swarm_result = self
            .swarm
            .execute_with_graph(goal, graph)
            .await
            .map_err(|e| {
                tracing::warn!("[ResearchSwarm] Swarm execution failed: {}", e);
                ResearchError::Internal(e.to_string())
            })?;

        tracing::info!(
            "[ResearchSwarm] Swarm completed: {}/{} succeeded, {:.2}x speedup",
            swarm_result.succeeded,
            swarm_result.succeeded + swarm_result.failed,
            swarm_result.speedup_ratio,
        );

        // Extract per-subtask results from the swarm output.
        //
        // `SwarmResult.output` is the aggregated output — it may be an object
        // or array depending on the aggregation strategy.  We need the
        // individual SubtaskResult values which are not directly on SwarmResult
        // but can be reconstructed from the output structure.
        //
        // However, the swarm aggregator already merged them. For research we
        // need per-agent results, so we reconstruct from the output.
        let agent_results = reconstruct_agent_results_from_output(
            &swarm_result.output,
            swarm_result.succeeded,
            swarm_result.failed,
        );

        Ok(agent_results)
    }
}

/// Reconstructs [`SearchAgentResult`] values from the aggregated swarm output.
///
/// The swarm `MergeAll` aggregator merges all successful subtask outputs into
/// a single JSON object or array. We attempt to pull individual results back
/// out. If that fails we wrap the entire output as a single result.
fn reconstruct_agent_results_from_output(
    output: &serde_json::Value,
    _succeeded: usize,
    _failed: usize,
) -> Vec<SearchAgentResult> {
    // Case 1: output is an array of per-subtask results
    if let Some(arr) = output.as_array() {
        let mut results = Vec::new();
        for item in arr {
            if let Some(agent_result) = try_parse_single_result(item) {
                results.push(agent_result);
            }
        }
        if !results.is_empty() {
            return results;
        }
    }

    // Case 2: output is a single merged object — try to parse as one result
    if let Some(agent_result) = try_parse_single_result(output) {
        return vec![agent_result];
    }

    // Case 3: fallback — return empty
    Vec::new()
}

/// Attempts to parse a single JSON value into a [`SearchAgentResult`].
fn try_parse_single_result(value: &serde_json::Value) -> Option<SearchAgentResult> {
    use super::agents::SearchResult;
    use super::types::AgentType;

    let search_results: Vec<SearchResult> = value
        .get("search_results")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let agent_type_str = value.get("agent_type").and_then(|v| v.as_str())?;
    let agent_type = match agent_type_str {
        "web_search" => AgentType::WebSearch,
        "document_search" => AgentType::DocumentSearch,
        "email_search" => AgentType::EmailSearch,
        "calendar_search" => AgentType::CalendarSearch,
        "memory_search" => AgentType::MemorySearch,
        _ => AgentType::WebSearch,
    };

    let search_time_ms = value
        .get("search_time_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    Some(SearchAgentResult {
        agent_type,
        results: search_results,
        search_time_ms,
        warnings: Vec::new(),
        complete: true,
        error: None,
    })
}
