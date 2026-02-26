//! # Agent Swarm System
//!
//! A high-performance, massively parallel agent orchestration system inspired by Kimi K2.5.
//!
//! ## Architecture
//!
//! The swarm system implements a **hub-and-spoke** communication model where:
//! - A central **orchestrator** (hub) coordinates all sub-agents
//! - Sub-agents (spokes) execute tasks independently and report back
//! - No predefined roles - agents are created on-demand based on task requirements
//!
//! ## Key Components
//!
//! - [`SwarmOrchestrator`]: Central coordinator managing up to 100 concurrent sub-agents
//! - [`TaskDecomposer`]: Breaks complex tasks into parallelizable subtasks
//! - [`AgentSpawner`]: Dynamic sub-agent instantiation with frozen weights
//! - [`ResultAggregator`]: Synthesizes results from parallel executions
//!
//! ## Critical Path Optimization
//!
//! Following Kimi K2.5's critical path metric:
//! ```text
//! CriticalSteps = overhead + max(concurrent_duration)
//! ```
//!
//! The system minimizes the longest execution chain by:
//! 1. Identifying independent subtasks that can run in parallel
//! 2. Scheduling dependent tasks to minimize blocking
//! 3. Dynamic load balancing across available agents
//!
//! ## Circuit Breaker Pattern
//!
//! Prevents cascading failures with:
//! - Per-agent failure thresholds
//! - Automatic agent recovery/restart
//! - Graceful degradation under load
//!
//! ## Example
//!
//! ```rust,ignore
//! use swarm::{SwarmOrchestrator, SwarmConfig};
//!
//! let config = SwarmConfig::default();
//! let orchestrator = SwarmOrchestrator::new(config, router, automation, app_handle)?;
//!
//! // Submit a complex task for parallel execution
//! let result = orchestrator.execute_swarm_task(goal).await?;
//! ```

pub mod agent_spawner;
pub mod orchestrator;
pub mod result_aggregator;
pub mod task_decomposer;

#[cfg(test)]
mod tests;

// Re-exports for convenient access
pub use agent_spawner::{AgentSpawner, SpawnedAgent, SubAgentConfig};
pub use orchestrator::{SwarmConfig, SwarmOrchestrator, SwarmResult, SwarmStats};
pub use result_aggregator::{
    AggregatedResult, AggregationStrategy, ResultAggregator, SubtaskResult,
};
pub use task_decomposer::{
    DependencyGraph, ParallelizationHint, Subtask, SubtaskType, TaskDecomposer,
};

use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

/// Errors that can occur in the swarm system.
#[derive(Error, Debug)]
pub enum SwarmError {
    #[error("Failed to spawn agent: {0}")]
    SpawnFailed(String),

    #[error("Agent {agent_id} failed: {reason}")]
    AgentFailed { agent_id: String, reason: String },

    #[error("Task decomposition failed: {0}")]
    DecompositionFailed(String),

    #[error("Result aggregation failed: {0}")]
    AggregationFailed(String),

    #[error("Circuit breaker open for agent {agent_id}")]
    CircuitBreakerOpen { agent_id: String },

    #[error("Swarm capacity exceeded: {current}/{max} agents")]
    CapacityExceeded { current: usize, max: usize },

    #[error("Timeout after {elapsed:?} (limit: {limit:?})")]
    Timeout { elapsed: Duration, limit: Duration },

    #[error("All agents failed for subtask {subtask_id}")]
    AllAgentsFailed { subtask_id: String },

    #[error("Dependency cycle detected: {cycle}")]
    DependencyCycle { cycle: String },

    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

/// Result type for swarm operations.
pub type SwarmResultType<T> = Result<T, SwarmError>;

/// Priority levels for subtasks in the swarm.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubtaskPriority {
    /// Background tasks that can be delayed.
    Low = 0,
    /// Standard priority for most tasks.
    Normal = 1,
    /// Higher priority for important tasks.
    High = 2,
    /// Critical path tasks that must complete first.
    Critical = 3,
}

impl Default for SubtaskPriority {
    fn default() -> Self {
        Self::Normal
    }
}

/// Status of a subtask in the swarm.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubtaskStatus {
    /// Waiting to be assigned to an agent.
    Pending,
    /// Currently being executed by an agent.
    Running,
    /// Successfully completed.
    Completed,
    /// Failed but may be retried.
    Failed,
    /// Cancelled before completion.
    Cancelled,
    /// Blocked waiting for dependencies.
    Blocked,
}

/// Health status of an agent in the swarm.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentHealth {
    /// Agent is ready to accept tasks.
    Healthy,
    /// Agent is experiencing issues but still operational.
    Degraded,
    /// Agent's circuit breaker is open due to failures.
    CircuitOpen,
    /// Agent is being recycled/restarted.
    Recovering,
    /// Agent has been terminated.
    Terminated,
}

/// Metrics for monitoring swarm performance.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SwarmMetrics {
    /// Total number of tasks submitted.
    pub tasks_submitted: u64,
    /// Total number of tasks completed successfully.
    pub tasks_completed: u64,
    /// Total number of tasks failed.
    pub tasks_failed: u64,
    /// Current number of active agents.
    pub active_agents: usize,
    /// Peak number of concurrent agents.
    pub peak_agents: usize,
    /// Total execution time across all agents (for calculating speedup).
    pub total_agent_time_ms: u64,
    /// Wall clock time for parallel execution.
    pub wall_clock_time_ms: u64,
    /// Calculated speedup ratio (sequential / parallel time).
    pub speedup_ratio: f64,
    /// Average task latency in milliseconds.
    pub avg_task_latency_ms: f64,
    /// Number of circuit breaker trips.
    pub circuit_breaker_trips: u64,
    /// Number of agent restarts due to failures.
    pub agent_restarts: u64,
}

impl SwarmMetrics {
    /// Calculates the actual speedup achieved by parallel execution.
    pub fn calculate_speedup(&mut self) {
        if self.wall_clock_time_ms > 0 {
            self.speedup_ratio = self.total_agent_time_ms as f64 / self.wall_clock_time_ms as f64;
        }
    }
}

/// Message types for hub-and-spoke communication.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SwarmMessage {
    /// Message from orchestrator to agent: execute this subtask.
    AssignTask {
        subtask_id: String,
        subtask: Subtask,
        deadline_ms: Option<u64>,
    },
    /// Message from agent to orchestrator: task completed.
    TaskComplete {
        agent_id: String,
        subtask_id: String,
        result: SubtaskResult,
    },
    /// Message from agent to orchestrator: task failed.
    TaskFailed {
        agent_id: String,
        subtask_id: String,
        error: String,
        retriable: bool,
    },
    /// Message from orchestrator to agent: cancel current task.
    CancelTask { subtask_id: String },
    /// Message from agent to orchestrator: heartbeat/status update.
    Heartbeat {
        agent_id: String,
        health: AgentHealth,
        current_task: Option<String>,
        load_percent: u8,
    },
    /// Message from orchestrator to all agents: shutdown.
    Shutdown { graceful: bool },
}

/// Configuration constants for the swarm system.
pub mod constants {
    use std::time::Duration;

    /// Maximum number of concurrent sub-agents.
    pub const MAX_CONCURRENT_AGENTS: usize = 100;

    /// Default timeout for individual subtasks.
    pub const DEFAULT_SUBTASK_TIMEOUT: Duration = Duration::from_secs(60);

    /// Default timeout for the entire swarm execution.
    pub const DEFAULT_SWARM_TIMEOUT: Duration = Duration::from_secs(300);

    /// Number of failures before circuit breaker opens.
    pub const CIRCUIT_BREAKER_THRESHOLD: u32 = 3;

    /// Duration circuit breaker stays open before half-open.
    pub const CIRCUIT_BREAKER_RESET_TIMEOUT: Duration = Duration::from_secs(30);

    /// Interval for agent heartbeat messages.
    pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);

    /// Maximum number of retries for failed subtasks.
    pub const MAX_SUBTASK_RETRIES: u32 = 2;

    /// Target speedup ratio (Kimi K2.5 achieves ~4.5x).
    pub const TARGET_SPEEDUP_RATIO: f64 = 4.5;

    /// Minimum subtasks for parallel execution to be worthwhile.
    pub const MIN_PARALLEL_SUBTASKS: usize = 2;

    /// Maximum depth of task decomposition.
    pub const MAX_DECOMPOSITION_DEPTH: usize = 5;

    /// Time-to-live for decomposition cache entries (1 hour).
    pub const DECOMPOSITION_CACHE_TTL: Duration = Duration::from_secs(3600);
}
