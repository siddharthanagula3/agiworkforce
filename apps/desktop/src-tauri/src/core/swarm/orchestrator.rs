//! Swarm Orchestrator - Central Coordinator
//!
//! Implements the hub-and-spoke communication model where the orchestrator
//! acts as the central hub coordinating up to 100 concurrent sub-agents.
//!
//! Following Kimi K2.5's architecture:
//! - Trainable orchestrator with frozen sub-agents
//! - Dynamic agent instantiation based on task requirements
//! - Critical path optimization for minimum execution time

use super::{
    agent_spawner::{AgentSpawner, AgentTask, AgentTaskResult, SpawnedAgent},
    constants,
    result_aggregator::{AggregationStrategy, ResultAggregator, SubtaskResult},
    task_decomposer::{DependencyGraph, Subtask, TaskDecomposer},
    AgentHealth, SwarmError, SwarmMetrics, SwarmResultType,
};
use crate::automation::AutomationService;
use crate::core::agi::Goal;
use crate::core::llm::LLMRouter;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::sync::oneshot;

/// Configuration for the swarm orchestrator.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmConfig {
    /// Maximum number of concurrent sub-agents.
    pub max_agents: usize,
    /// Timeout for the entire swarm execution.
    pub swarm_timeout: Duration,
    /// Timeout for individual subtasks.
    pub subtask_timeout: Duration,
    /// Strategy for aggregating results.
    pub aggregation_strategy: AggregationStrategy,
    /// Whether to automatically spawn agents on demand.
    pub auto_spawn: bool,
    /// Minimum number of agents to keep alive.
    pub min_agents: usize,
    /// Whether to enable critical path optimization.
    pub optimize_critical_path: bool,
    /// Maximum retries for failed subtasks.
    pub max_retries: u32,
    /// Interval for health checks.
    pub health_check_interval: Duration,
}

impl Default for SwarmConfig {
    fn default() -> Self {
        Self {
            max_agents: constants::MAX_CONCURRENT_AGENTS,
            swarm_timeout: constants::DEFAULT_SWARM_TIMEOUT,
            subtask_timeout: constants::DEFAULT_SUBTASK_TIMEOUT,
            aggregation_strategy: AggregationStrategy::MergeAll,
            auto_spawn: true,
            min_agents: 1,
            optimize_critical_path: true,
            max_retries: constants::MAX_SUBTASK_RETRIES,
            health_check_interval: constants::HEARTBEAT_INTERVAL,
        }
    }
}

/// Statistics about swarm execution.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SwarmStats {
    /// Total goals processed.
    pub goals_processed: u64,
    /// Total subtasks created.
    pub subtasks_created: u64,
    /// Total subtasks completed.
    pub subtasks_completed: u64,
    /// Total subtasks failed.
    pub subtasks_failed: u64,
    /// Peak number of concurrent agents.
    pub peak_agents: usize,
    /// Average speedup ratio achieved.
    pub avg_speedup_ratio: f64,
    /// Total wall clock time.
    pub total_wall_time_ms: u64,
    /// Total agent execution time.
    pub total_agent_time_ms: u64,
    /// Number of circuit breaker trips.
    pub circuit_breaker_trips: u64,
    /// Number of agent restarts.
    pub agent_restarts: u64,
}

/// Result of swarm execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmResult {
    /// Whether the overall execution succeeded.
    pub success: bool,
    /// The goal that was executed.
    pub goal_id: String,
    /// Aggregated output from all subtasks.
    pub output: serde_json::Value,
    /// Summary of execution.
    pub summary: String,
    /// Number of subtasks that succeeded.
    pub succeeded: usize,
    /// Number of subtasks that failed.
    pub failed: usize,
    /// Wall clock execution time.
    pub wall_time: Duration,
    /// Speedup ratio achieved.
    pub speedup_ratio: f64,
    /// Critical path length.
    pub critical_path_length: usize,
    /// Maximum parallelism achieved.
    pub max_parallelism: usize,
    /// Detailed metrics.
    pub metrics: SwarmMetrics,
}

/// The central swarm orchestrator.
pub struct SwarmOrchestrator {
    /// Configuration.
    config: SwarmConfig,
    /// LLM router for agent operations.
    #[allow(dead_code)]
    router: Arc<tokio::sync::RwLock<LLMRouter>>,
    /// Automation service.
    #[allow(dead_code)]
    automation: Arc<AutomationService>,
    /// Application handle for events.
    app_handle: Option<tauri::AppHandle>,
    /// Task decomposer.
    decomposer: TaskDecomposer,
    /// Agent spawner.
    spawner: Arc<AgentSpawner>,
    /// Result aggregator.
    aggregator: ResultAggregator,
    /// Current execution statistics.
    stats: Arc<RwLock<SwarmStats>>,
    /// Whether the orchestrator is currently running.
    is_running: Arc<AtomicBool>,
    /// Stop signal for graceful shutdown.
    stop_signal: Arc<AtomicBool>,
}

impl SwarmOrchestrator {
    /// Creates a new swarm orchestrator.
    pub fn new(
        config: SwarmConfig,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        automation: Arc<AutomationService>,
        app_handle: Option<tauri::AppHandle>,
    ) -> SwarmResultType<Self> {
        let decomposer = TaskDecomposer::new(router.clone());
        let spawner = Arc::new(AgentSpawner::new(
            router.clone(),
            automation.clone(),
            app_handle.clone(),
            config.max_agents,
        ));
        let aggregator = ResultAggregator::new(config.aggregation_strategy);

        Ok(Self {
            config,
            router,
            automation,
            app_handle,
            decomposer,
            spawner,
            aggregator,
            stats: Arc::new(RwLock::new(SwarmStats::default())),
            is_running: Arc::new(AtomicBool::new(false)),
            stop_signal: Arc::new(AtomicBool::new(false)),
        })
    }

    /// Executes a goal using the swarm system.
    pub async fn execute_swarm_task(&self, goal: Goal) -> SwarmResultType<SwarmResult> {
        let start_time = Instant::now();
        self.is_running.store(true, Ordering::SeqCst);
        self.stop_signal.store(false, Ordering::SeqCst);

        tracing::info!(
            "[SwarmOrchestrator] Starting swarm execution for goal: {}",
            goal.description
        );

        self.emit_event(
            "swarm:started",
            serde_json::json!({
                "goal_id": goal.id,
                "description": goal.description,
            }),
        );

        // Step 1: Decompose the task into subtasks
        let mut dependency_graph = self.decomposer.decompose(&goal).await?;

        let initial_stats = dependency_graph.stats();
        tracing::info!(
            "[SwarmOrchestrator] Task decomposed: {} subtasks, critical path: {}",
            initial_stats.total_subtasks,
            initial_stats.critical_path_length
        );

        self.emit_event(
            "swarm:decomposed",
            serde_json::json!({
                "goal_id": goal.id,
                "total_subtasks": initial_stats.total_subtasks,
                "critical_path_length": initial_stats.critical_path_length,
                "max_parallelism": initial_stats.max_parallelism,
            }),
        );

        // Update stats
        {
            let mut stats = self.stats.write();
            stats.goals_processed += 1;
            stats.subtasks_created += initial_stats.total_subtasks as u64;
        }

        // Step 2: Optimize critical path if enabled
        if self.config.optimize_critical_path {
            self.decomposer
                .optimize_critical_path(&mut dependency_graph);
        }

        // Step 3: Execute subtasks with parallel scheduling
        let results = self.execute_parallel(&goal, &mut dependency_graph).await?;

        // Step 4: Aggregate results
        let wall_time = start_time.elapsed();
        let aggregated = self.aggregator.aggregate(results, wall_time)?;

        // Step 5: Build final result
        let final_stats = dependency_graph.stats();
        let result = SwarmResult {
            success: aggregated.success,
            goal_id: goal.id.clone(),
            output: aggregated.output,
            summary: aggregated.summary,
            succeeded: aggregated.succeeded_count,
            failed: aggregated.failed_count,
            wall_time,
            speedup_ratio: aggregated.speedup_ratio,
            critical_path_length: final_stats.critical_path_length,
            max_parallelism: final_stats.max_parallelism,
            metrics: SwarmMetrics {
                tasks_submitted: initial_stats.total_subtasks as u64,
                tasks_completed: aggregated.succeeded_count as u64,
                tasks_failed: aggregated.failed_count as u64,
                active_agents: self.spawner.active_agent_count(),
                peak_agents: final_stats.max_parallelism,
                total_agent_time_ms: aggregated.total_agent_time.as_millis() as u64,
                wall_clock_time_ms: wall_time.as_millis() as u64,
                speedup_ratio: aggregated.speedup_ratio,
                avg_task_latency_ms: if aggregated.subtask_results.is_empty() {
                    0.0
                } else {
                    aggregated.total_agent_time.as_millis() as f64
                        / aggregated.subtask_results.len() as f64
                },
                circuit_breaker_trips: 0, // TODO: Track from spawner
                agent_restarts: self.spawner.get_stats().restart_count,
            },
        };

        // Update stats
        {
            let mut stats = self.stats.write();
            stats.subtasks_completed += aggregated.succeeded_count as u64;
            stats.subtasks_failed += aggregated.failed_count as u64;
            stats.total_wall_time_ms += wall_time.as_millis() as u64;
            stats.total_agent_time_ms += aggregated.total_agent_time.as_millis() as u64;

            // Update average speedup ratio
            let total_executions = stats.goals_processed;
            stats.avg_speedup_ratio = (stats.avg_speedup_ratio * (total_executions - 1) as f64
                + aggregated.speedup_ratio)
                / total_executions as f64;

            if final_stats.max_parallelism > stats.peak_agents {
                stats.peak_agents = final_stats.max_parallelism;
            }
        }

        self.emit_event(
            "swarm:completed",
            serde_json::json!({
                "goal_id": goal.id,
                "success": result.success,
                "succeeded": result.succeeded,
                "failed": result.failed,
                "wall_time_ms": wall_time.as_millis(),
                "speedup_ratio": result.speedup_ratio,
            }),
        );

        self.is_running.store(false, Ordering::SeqCst);

        tracing::info!(
            "[SwarmOrchestrator] Swarm execution completed: {} ({}/{} succeeded, {:.2}x speedup)",
            if result.success { "SUCCESS" } else { "FAILED" },
            result.succeeded,
            result.succeeded + result.failed,
            result.speedup_ratio
        );

        Ok(result)
    }

    async fn execute_parallel(
        &self,
        goal: &Goal,
        graph: &mut DependencyGraph,
    ) -> SwarmResultType<Vec<SubtaskResult>> {
        let mut results: Vec<SubtaskResult> = Vec::new();
        let mut pending_tasks: HashMap<String, oneshot::Receiver<AgentTaskResult>> = HashMap::new();
        let deadline = Instant::now() + self.config.swarm_timeout;

        loop {
            // Check for stop signal
            if self.stop_signal.load(Ordering::SeqCst) {
                tracing::info!("[SwarmOrchestrator] Stop signal received, aborting");
                break;
            }

            // Check timeout
            if Instant::now() > deadline {
                tracing::warn!("[SwarmOrchestrator] Swarm execution timed out");
                return Err(SwarmError::Timeout {
                    elapsed: self.config.swarm_timeout,
                    limit: self.config.swarm_timeout,
                });
            }

            // Get ready subtasks
            let ready_subtasks: Vec<Subtask> =
                graph.get_ready_subtasks().into_iter().cloned().collect();

            // Spawn agents and assign tasks for ready subtasks
            for subtask in ready_subtasks {
                // Skip if already pending
                if pending_tasks.contains_key(&subtask.id) {
                    continue;
                }

                // Get or spawn an agent
                let agent = match self.get_or_spawn_agent().await {
                    Ok(a) => a,
                    Err(e) => {
                        tracing::warn!(
                            "[SwarmOrchestrator] Failed to get agent for {}: {}",
                            subtask.id,
                            e
                        );
                        continue;
                    }
                };

                // Create result channel
                let (tx, rx) = oneshot::channel();

                // Send task to agent
                let task = AgentTask {
                    subtask: subtask.clone(),
                    result_sender: tx,
                };

                match agent.send_task(task).await {
                    Ok(_) => {
                        graph.mark_running(&subtask.id);
                        pending_tasks.insert(subtask.id.clone(), rx);

                        self.emit_event(
                            "swarm:subtask_started",
                            serde_json::json!({
                                "goal_id": goal.id,
                                "subtask_id": subtask.id,
                                "agent_id": agent.id,
                                "description": subtask.description,
                            }),
                        );

                        tracing::debug!(
                            "[SwarmOrchestrator] Assigned subtask {} to agent {}",
                            subtask.id,
                            agent.id
                        );
                    }
                    Err(e) => {
                        tracing::warn!("[SwarmOrchestrator] Failed to assign task to agent: {}", e);
                    }
                }
            }

            // Check for completed tasks
            let mut completed_ids = Vec::new();
            for (subtask_id, rx) in pending_tasks.iter_mut() {
                match rx.try_recv() {
                    Ok(task_result) => {
                        completed_ids.push(subtask_id.clone());

                        let result = SubtaskResult {
                            subtask_id: subtask_id.clone(),
                            agent_id: task_result.subtask_id.clone(), // Note: should be agent_id
                            success: task_result.success,
                            output: task_result.result,
                            error: task_result.error.clone(),
                            execution_time: Duration::from_millis(task_result.execution_time_ms),
                            retries_used: 0,
                            metadata: HashMap::new(),
                        };

                        if task_result.success {
                            graph.mark_completed(subtask_id);
                            self.emit_event(
                                "swarm:subtask_completed",
                                serde_json::json!({
                                    "goal_id": goal.id,
                                    "subtask_id": subtask_id,
                                    "execution_time_ms": task_result.execution_time_ms,
                                }),
                            );
                        } else {
                            let will_retry = graph.mark_failed(subtask_id);
                            if will_retry && task_result.retriable {
                                tracing::info!(
                                    "[SwarmOrchestrator] Subtask {} will be retried",
                                    subtask_id
                                );
                            } else {
                                self.emit_event(
                                    "swarm:subtask_failed",
                                    serde_json::json!({
                                        "goal_id": goal.id,
                                        "subtask_id": subtask_id,
                                        "error": task_result.error,
                                    }),
                                );
                            }
                        }

                        results.push(result);
                    }
                    Err(oneshot::error::TryRecvError::Empty) => {
                        // Still waiting
                    }
                    Err(oneshot::error::TryRecvError::Closed) => {
                        // Channel closed without result - agent failed
                        completed_ids.push(subtask_id.clone());
                        graph.mark_failed(subtask_id);

                        results.push(SubtaskResult::failure(
                            subtask_id.clone(),
                            "unknown",
                            "Agent channel closed unexpectedly",
                            Duration::ZERO,
                        ));
                    }
                }
            }

            // Remove completed tasks from pending
            for id in completed_ids {
                pending_tasks.remove(&id);
            }

            // Check if all tasks are complete
            if graph.is_complete() {
                tracing::debug!("[SwarmOrchestrator] All subtasks complete");
                break;
            }

            // If no tasks are pending and no new tasks are ready, we're stuck
            if pending_tasks.is_empty() && graph.get_ready_subtasks().is_empty() {
                let stats = graph.stats();
                if stats.pending > 0 {
                    // Some tasks are blocked - likely due to failed dependencies
                    tracing::warn!(
                        "[SwarmOrchestrator] {} subtasks blocked due to failed dependencies",
                        stats.pending
                    );
                }
                break;
            }

            // Brief sleep to avoid busy-waiting
            tokio::time::sleep(Duration::from_millis(10)).await;
        }

        Ok(results)
    }

    async fn get_or_spawn_agent(&self) -> SwarmResultType<Arc<SpawnedAgent>> {
        // Try to get an existing available agent
        if let Some(agent) = self.spawner.get_available_agent() {
            return Ok(agent);
        }

        // Spawn a new agent if auto-spawn is enabled
        if self.config.auto_spawn {
            return self.spawner.spawn(None).await;
        }

        Err(SwarmError::CapacityExceeded {
            current: self.spawner.active_agent_count(),
            max: self.config.max_agents,
        })
    }

    /// Stops the orchestrator gracefully.
    pub fn stop(&self) {
        tracing::info!("[SwarmOrchestrator] Initiating graceful shutdown");
        self.stop_signal.store(true, Ordering::SeqCst);
    }

    /// Forcefully terminates all agents.
    pub fn terminate_all(&self) {
        tracing::info!("[SwarmOrchestrator] Terminating all agents");
        self.spawner.terminate_all();
        self.is_running.store(false, Ordering::SeqCst);
    }

    /// Gets current statistics.
    pub fn get_stats(&self) -> SwarmStats {
        self.stats.read().clone()
    }

    /// Gets the number of active agents.
    pub fn active_agent_count(&self) -> usize {
        self.spawner.active_agent_count()
    }

    /// Checks if the orchestrator is currently running.
    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    fn emit_event(&self, event: &str, payload: serde_json::Value) {
        if let Some(ref app) = self.app_handle {
            if let Err(e) = app.emit(event, payload) {
                tracing::warn!("[SwarmOrchestrator] Failed to emit event {}: {}", event, e);
            }
        }
    }

    /// Pre-warms the agent pool with a specified number of agents.
    pub async fn prewarm_agents(&self, count: usize) -> SwarmResultType<()> {
        tracing::info!("[SwarmOrchestrator] Pre-warming {} agents", count);

        for i in 0..count {
            match self.spawner.spawn(None).await {
                Ok(agent) => {
                    tracing::debug!(
                        "[SwarmOrchestrator] Pre-warmed agent {}: {}",
                        i + 1,
                        agent.id
                    );
                }
                Err(e) => {
                    tracing::warn!(
                        "[SwarmOrchestrator] Failed to pre-warm agent {}: {}",
                        i + 1,
                        e
                    );
                    break;
                }
            }
        }

        Ok(())
    }

    /// Gets health status of all agents.
    pub fn get_agent_health(&self) -> Vec<(String, AgentHealth)> {
        self.spawner
            .get_healthy_agents()
            .iter()
            .map(|a| (a.id.clone(), *a.health.read()))
            .collect()
    }

    /// Restarts unhealthy agents.
    pub async fn restart_unhealthy_agents(&self) -> SwarmResultType<usize> {
        let agents = self.spawner.get_healthy_agents();
        let mut restarted = 0;

        for agent in agents {
            let health = *agent.health.read();
            if health == AgentHealth::CircuitOpen || health == AgentHealth::Degraded {
                match self.spawner.restart_agent(&agent.id).await {
                    Ok(_) => restarted += 1,
                    Err(e) => {
                        tracing::warn!(
                            "[SwarmOrchestrator] Failed to restart agent {}: {}",
                            agent.id,
                            e
                        );
                    }
                }
            }
        }

        Ok(restarted)
    }
}

/// Builder for creating a SwarmOrchestrator with custom configuration.
pub struct SwarmOrchestratorBuilder {
    config: SwarmConfig,
    router: Option<Arc<tokio::sync::RwLock<LLMRouter>>>,
    automation: Option<Arc<AutomationService>>,
    app_handle: Option<tauri::AppHandle>,
}

impl SwarmOrchestratorBuilder {
    /// Creates a new builder with default configuration.
    pub fn new() -> Self {
        Self {
            config: SwarmConfig::default(),
            router: None,
            automation: None,
            app_handle: None,
        }
    }

    /// Sets the maximum number of concurrent agents.
    pub fn max_agents(mut self, max: usize) -> Self {
        self.config.max_agents = max;
        self
    }

    /// Sets the swarm timeout.
    pub fn swarm_timeout(mut self, timeout: Duration) -> Self {
        self.config.swarm_timeout = timeout;
        self
    }

    /// Sets the subtask timeout.
    pub fn subtask_timeout(mut self, timeout: Duration) -> Self {
        self.config.subtask_timeout = timeout;
        self
    }

    /// Sets the aggregation strategy.
    pub fn aggregation_strategy(mut self, strategy: AggregationStrategy) -> Self {
        self.config.aggregation_strategy = strategy;
        self
    }

    /// Enables or disables auto-spawn.
    pub fn auto_spawn(mut self, enabled: bool) -> Self {
        self.config.auto_spawn = enabled;
        self
    }

    /// Enables or disables critical path optimization.
    pub fn optimize_critical_path(mut self, enabled: bool) -> Self {
        self.config.optimize_critical_path = enabled;
        self
    }

    /// Sets the LLM router.
    pub fn router(mut self, router: Arc<tokio::sync::RwLock<LLMRouter>>) -> Self {
        self.router = Some(router);
        self
    }

    /// Sets the automation service.
    pub fn automation(mut self, automation: Arc<AutomationService>) -> Self {
        self.automation = Some(automation);
        self
    }

    /// Sets the application handle.
    pub fn app_handle(mut self, handle: tauri::AppHandle) -> Self {
        self.app_handle = Some(handle);
        self
    }

    /// Builds the SwarmOrchestrator.
    pub fn build(self) -> SwarmResultType<SwarmOrchestrator> {
        let router = self
            .router
            .ok_or_else(|| SwarmError::Internal(anyhow::anyhow!("LLM router is required")))?;
        let automation = self.automation.ok_or_else(|| {
            SwarmError::Internal(anyhow::anyhow!("Automation service is required"))
        })?;

        SwarmOrchestrator::new(self.config, router, automation, self.app_handle)
    }
}

impl Default for SwarmOrchestratorBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_swarm_config_default() {
        let config = SwarmConfig::default();
        assert_eq!(config.max_agents, constants::MAX_CONCURRENT_AGENTS);
        assert!(config.auto_spawn);
        assert!(config.optimize_critical_path);
    }

    #[test]
    fn test_swarm_stats_default() {
        let stats = SwarmStats::default();
        assert_eq!(stats.goals_processed, 0);
        assert_eq!(stats.peak_agents, 0);
    }
}
