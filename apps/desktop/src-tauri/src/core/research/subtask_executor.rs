//! Lightweight research subtask executor.
//!
//! When the swarm spawner encounters a subtask whose description starts with
//! `[research_subtask]`, it delegates here instead of spinning up a full
//! AGICore instance. This keeps per-subtask overhead minimal — no LLM call
//! for decomposition, just the actual search.

use super::agents::SearchAgentResult;
use super::swarm_bridge::RESEARCH_SUBTASK_PREFIX;
use super::types::{AgentType, SearchStrategy};
use crate::core::swarm::task_decomposer::Subtask;
use anyhow::Result;
use std::time::Instant;

/// Executes a single research subtask by parsing the strategy metadata out
/// of the subtask and invoking the appropriate search agent directly.
///
/// Returns a JSON value matching the contract expected by
/// [`swarm_bridge::swarm_results_to_agent_results`].
#[allow(dead_code)]
pub async fn execute_research_subtask(subtask: &Subtask) -> Result<serde_json::Value> {
    let start = Instant::now();

    // Extract agent type and search terms from the subtask parameters
    let agent_type_str = subtask
        .parameters
        .get("agent_type")
        .and_then(|v| v.as_str())
        .unwrap_or("web_search");

    let search_terms: Vec<String> = subtask
        .parameters
        .get("search_terms")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let strategy_description = subtask
        .parameters
        .get("strategy_description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let agent_type = match agent_type_str {
        "web_search" => AgentType::WebSearch,
        "document_search" => AgentType::DocumentSearch,
        "email_search" => AgentType::EmailSearch,
        "calendar_search" => AgentType::CalendarSearch,
        "memory_search" => AgentType::MemorySearch,
        _ => AgentType::WebSearch,
    };

    // Build a temporary strategy for the search agent
    let strategy = SearchStrategy {
        id: subtask.id.clone(),
        description: strategy_description,
        agent_type,
        search_terms,
        priority: 5,
        expected_relevance: subtask
            .parameters
            .get("expected_relevance")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5) as f32,
    };

    // Execute the search using the concrete agent
    let agent_result = execute_search_with_agent(agent_type, &strategy).await;

    let elapsed_ms = start.elapsed().as_millis() as u64;

    // Serialize search results into a JSON blob that swarm_bridge can decode
    let search_results_json = serde_json::to_value(&agent_result.results).unwrap_or_default();

    Ok(serde_json::json!({
        "status": if agent_result.error.is_some() { "failed" } else { "completed" },
        "agent_type": agent_type.as_str(),
        "search_results": search_results_json,
        "result_count": agent_result.results.len(),
        "search_time_ms": elapsed_ms,
        "subtask_id": subtask.id,
    }))
}

/// Returns `true` if the subtask description indicates it is a research
/// subtask that should be routed to this lightweight executor.
pub fn is_research_subtask(subtask: &Subtask) -> bool {
    subtask.description.starts_with(RESEARCH_SUBTASK_PREFIX)
}

// ---------------------------------------------------------------------------
// Agent dispatch
// ---------------------------------------------------------------------------

/// Routes to the concrete search agent based on type.
///
/// Each agent type currently creates a fresh agent instance and runs a
/// single search. Future work may pool agents or cache connections.
async fn execute_search_with_agent(
    agent_type: AgentType,
    strategy: &SearchStrategy,
) -> SearchAgentResult {
    use super::agents::{
        CalendarSearchAgent, DocumentSearchAgent, EmailSearchAgent, MemorySearchAgent,
        SearchAgent, WebSearchAgent,
    };

    let max_results: usize = 10;

    let result = match agent_type {
        AgentType::WebSearch => {
            let agent = WebSearchAgent::new();
            if agent.is_available() {
                agent.search(strategy, None, max_results).await
            } else {
                Ok(SearchAgentResult::empty(AgentType::WebSearch))
            }
        }
        AgentType::DocumentSearch => {
            let agent = DocumentSearchAgent::new();
            if agent.is_available() {
                agent.search(strategy, None, max_results).await
            } else {
                Ok(SearchAgentResult::empty(AgentType::DocumentSearch))
            }
        }
        AgentType::EmailSearch => {
            let agent = EmailSearchAgent::new();
            if agent.is_available() {
                agent.search(strategy, None, max_results).await
            } else {
                Ok(SearchAgentResult::empty(AgentType::EmailSearch))
            }
        }
        AgentType::CalendarSearch => {
            let agent = CalendarSearchAgent::new();
            if agent.is_available() {
                agent.search(strategy, None, max_results).await
            } else {
                Ok(SearchAgentResult::empty(AgentType::CalendarSearch))
            }
        }
        AgentType::MemorySearch => {
            let agent = MemorySearchAgent::new();
            if agent.is_available() {
                agent.search(strategy, None, max_results).await
            } else {
                Ok(SearchAgentResult::empty(AgentType::MemorySearch))
            }
        }
    };

    match result {
        Ok(r) => r,
        Err(e) => SearchAgentResult::failed(agent_type, &e.to_string()),
    }
}
