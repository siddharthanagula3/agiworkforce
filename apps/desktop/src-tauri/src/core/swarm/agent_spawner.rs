//! Dynamic Sub-Agent Spawner
//!
//! Implements dynamic agent instantiation:
//! - Trainable orchestrator with frozen sub-agents
//! - No predefined roles - agents created on-demand
//! - Circuit breaker pattern for fault tolerance

use super::{constants, task_decomposer::Subtask, AgentHealth, SwarmError, SwarmResultType};
use crate::automation::AutomationService;
use crate::core::agi::{AGIConfig, AGICore, Goal, Priority, ResourceLimits};
use crate::core::llm::LLMRouter;
use crate::sys::account::{current_managed_auth_boundary, scope_managed_auth_boundary};
use agiworkforce_protocol::task_state::AgentTaskState;
use anyhow::Result;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, oneshot, OwnedSemaphorePermit, Semaphore};
use uuid::Uuid;

const GOAL_COMPLETION_POLL_INTERVAL: Duration = Duration::from_millis(100);

/// Configuration for a sub-agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubAgentConfig {
    /// Maximum concurrent tasks this agent can handle.
    pub max_concurrent_tasks: usize,
    /// Timeout for individual operations.
    pub operation_timeout: Duration,
    /// Whether to use local LLM fallback.
    pub use_local_llm_fallback: bool,
    /// Resource limits for this agent.
    pub resource_limits: ResourceLimits,
    /// Whether this agent is "frozen" (no learning updates).
    pub frozen: bool,
}

impl Default for SubAgentConfig {
    fn default() -> Self {
        Self {
            max_concurrent_tasks: 1,
            operation_timeout: constants::DEFAULT_SUBTASK_TIMEOUT,
            use_local_llm_fallback: true,
            resource_limits: ResourceLimits {
                cpu_percent: 10.0,  // Each agent gets limited CPU
                memory_mb: 256,     // Limited memory per agent
                network_mbps: 10.0, // Limited network
                storage_mb: 100,    // Limited storage
            },
            frozen: true, // Sub-agents are frozen by default.
        }
    }
}

/// Circuit breaker state for fault tolerance.
#[derive(Debug)]
struct CircuitBreaker {
    /// Number of consecutive failures.
    failure_count: AtomicU32,
    /// Timestamp when circuit was last opened.
    last_failure: RwLock<Option<Instant>>,
    /// Whether circuit is currently open.
    is_open: AtomicBool,
    /// Number of times the circuit has tripped (opened).
    trips: AtomicU64,
    /// Threshold before opening circuit.
    threshold: u32,
    /// Duration to keep circuit open.
    reset_timeout: Duration,
}

impl CircuitBreaker {
    fn new() -> Self {
        Self {
            failure_count: AtomicU32::new(0),
            last_failure: RwLock::new(None),
            is_open: AtomicBool::new(false),
            trips: AtomicU64::new(0),
            threshold: constants::CIRCUIT_BREAKER_THRESHOLD,
            reset_timeout: constants::CIRCUIT_BREAKER_RESET_TIMEOUT,
        }
    }

    /// Records a successful operation.
    fn record_success(&self) {
        self.failure_count.store(0, Ordering::SeqCst);
        self.is_open.store(false, Ordering::SeqCst);
    }

    /// Records a failed operation, potentially opening the circuit.
    fn record_failure(&self) -> bool {
        let count = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
        *self.last_failure.write() = Some(Instant::now());

        if count >= self.threshold {
            self.is_open.store(true, Ordering::SeqCst);
            self.trips.fetch_add(1, Ordering::SeqCst);
            true // Circuit opened
        } else {
            false
        }
    }

    /// Gets the number of times the circuit has tripped.
    fn get_trips(&self) -> u64 {
        self.trips.load(Ordering::SeqCst)
    }

    /// Checks if the circuit allows operations.
    fn allow_request(&self) -> bool {
        if !self.is_open.load(Ordering::SeqCst) {
            return true;
        }

        // Check if enough time has passed to try again (half-open state)
        if let Some(last) = *self.last_failure.read() {
            if last.elapsed() >= self.reset_timeout {
                // Allow one request through (half-open)
                return true;
            }
        }

        false
    }
}

/// A spawned sub-agent instance.
pub struct SpawnedAgent {
    /// Unique identifier for this agent.
    pub id: String,
    /// Current health status.
    pub health: Arc<RwLock<AgentHealth>>,
    /// Configuration for this agent.
    pub config: SubAgentConfig,
    /// Number of tasks completed.
    pub tasks_completed: AtomicU64,
    /// Number of tasks failed.
    pub tasks_failed: AtomicU64,
    /// Total execution time in milliseconds.
    pub total_execution_time_ms: AtomicU64,
    /// Circuit breaker for fault tolerance.
    circuit_breaker: Arc<CircuitBreaker>,
    /// Channel to send tasks to this agent.
    task_sender: mpsc::Sender<AgentTask>,
    /// Signal to stop the agent.
    stop_signal: Arc<AtomicBool>,
    /// Current task being executed.
    current_task: Arc<RwLock<Option<String>>>,
    /// Capacity permit, released when the agent is dropped from the pool.
    _permit: OwnedSemaphorePermit,
}

impl SpawnedAgent {
    pub fn can_accept_task(&self) -> bool {
        *self.health.read() != AgentHealth::Terminated
            && self.circuit_breaker.allow_request()
            && self.current_task.read().is_none()
    }

    /// Gets the agent's current load (0-100).
    pub fn get_load_percent(&self) -> u8 {
        if self.current_task.read().is_some() {
            100
        } else {
            0
        }
    }

    /// Sends a task to this agent.
    pub async fn send_task(&self, task: AgentTask) -> SwarmResultType<()> {
        if !self.can_accept_task() {
            return Err(SwarmError::CircuitBreakerOpen {
                agent_id: self.id.clone(),
            });
        }

        // The task loop only marks itself busy once it dequeues, too late to
        // stop a second dispatch in the same scheduling pass picking this agent.
        let subtask_id = task.subtask.id.clone();
        *self.current_task.write() = Some(subtask_id);

        self.task_sender.send(task).await.map_err(|_| {
            *self.current_task.write() = None;
            SwarmError::AgentFailed {
                agent_id: self.id.clone(),
                reason: "Task channel closed".to_string(),
            }
        })
    }

    /// Signals the agent to stop.
    pub fn stop(&self) {
        self.stop_signal.store(true, Ordering::SeqCst);
    }

    /// Records a successful task completion.
    pub fn record_success(&self, execution_time_ms: u64) {
        self.tasks_completed.fetch_add(1, Ordering::SeqCst);
        self.total_execution_time_ms
            .fetch_add(execution_time_ms, Ordering::SeqCst);
        self.circuit_breaker.record_success();
        *self.current_task.write() = None;
    }

    /// Records a task failure.
    pub fn record_failure(&self) {
        self.tasks_failed.fetch_add(1, Ordering::SeqCst);
        let circuit_opened = self.circuit_breaker.record_failure();
        if circuit_opened {
            *self.health.write() = AgentHealth::CircuitOpen;
        }
        *self.current_task.write() = None;
    }

    /// Gets the number of circuit breaker trips for this agent.
    pub fn get_circuit_breaker_trips(&self) -> u64 {
        self.circuit_breaker.get_trips()
    }
}

/// Task sent to an agent for execution.
#[derive(Debug)]
pub struct AgentTask {
    /// Subtask to execute.
    pub subtask: Subtask,
    /// TRUST BOUNDARY (desktop-trust-boundary-01): the parent goal's
    /// execution boundary. Threaded into the mini-`Goal` each sub-agent
    /// submits so fan-out cannot silently widen (or lose) the boundary the
    /// user selected; absent, the router fails closed to Local.
    pub trust_mode: Option<agiworkforce_model_registry::TrustMode>,
    /// Channel to send result back.
    pub result_sender: oneshot::Sender<AgentTaskResult>,
}

/// Result of an agent task execution.
#[derive(Debug)]
pub struct AgentTaskResult {
    /// Subtask ID.
    pub subtask_id: String,
    /// ID of the agent that executed this task.
    pub agent_id: String,
    /// Whether execution was successful.
    pub success: bool,
    /// Result value if successful.
    pub result: Option<serde_json::Value>,
    /// Error message if failed.
    pub error: Option<String>,
    /// Execution time in milliseconds.
    pub execution_time_ms: u64,
    /// Whether the task can be retried.
    pub retriable: bool,
}

/// How the goal a sub-agent submitted for its subtask actually finished.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SubtaskOutcome {
    Succeeded,
    Failed(&'static str),
}

/// What became of a submitted sub-goal inside the subtask's time budget.
#[derive(Debug)]
enum SettledGoal {
    Outcome(SubtaskOutcome),
    SubmitFailed(anyhow::Error),
    OutOfTime,
}

/// Maps an engine task state onto the outcome the swarm reports for a subtask.
/// `None` means the goal is still live and the sub-agent must keep waiting.
///
/// Finished engine work settles on `ReadyForReview`: `Completed` is a human
/// acceptance rather than an execution outcome, so waiting on
/// `AgentTaskState::is_terminal` alone would never observe a successful run.
fn goal_outcome(task_state: AgentTaskState) -> Option<SubtaskOutcome> {
    match task_state {
        AgentTaskState::ReadyForReview | AgentTaskState::Completed | AgentTaskState::Archived => {
            Some(SubtaskOutcome::Succeeded)
        }
        AgentTaskState::Failed => Some(SubtaskOutcome::Failed(
            "Sub-agent stopped before finishing the subtask",
        )),
        AgentTaskState::Cancelled => Some(SubtaskOutcome::Failed("Subtask was cancelled")),
        // A sub-goal runs in a throwaway core whose id no surface is bound to,
        // so nobody can ever answer it; waiting would burn the whole subtask
        // budget and hold a pool slot for a question with no asker.
        AgentTaskState::AwaitingInput => Some(SubtaskOutcome::Failed(
            "Subtask needed input no one can answer",
        )),
        AgentTaskState::Queued | AgentTaskState::Running | AgentTaskState::Paused => None,
    }
}

/// Spawner for creating and managing sub-agents.
pub struct AgentSpawner {
    /// LLM router for agent operations.
    router: Arc<tokio::sync::RwLock<LLMRouter>>,
    /// Automation service for UI/system operations.
    automation: Arc<AutomationService>,
    /// Application handle for events.
    app_handle: Option<tauri::AppHandle>,
    /// Active agents indexed by ID.
    agents: Arc<RwLock<HashMap<String, Arc<SpawnedAgent>>>>,
    /// Task handles indexed by agent ID for abort-based termination.
    handles: Arc<RwLock<HashMap<String, tokio::task::JoinHandle<()>>>>,
    /// Semaphore to limit concurrent agents.
    agent_semaphore: Arc<Semaphore>,
    /// Maximum number of concurrent agents.
    max_agents: usize,
    /// Default configuration for new agents.
    default_config: SubAgentConfig,
    /// Counter for total agents spawned.
    total_spawned: AtomicU64,
    /// Counter for agent restarts.
    restart_count: AtomicU64,
}

impl AgentSpawner {
    /// Creates a new agent spawner.
    pub fn new(
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        automation: Arc<AutomationService>,
        app_handle: Option<tauri::AppHandle>,
        max_agents: usize,
    ) -> Self {
        Self {
            router,
            automation,
            app_handle,
            agents: Arc::new(RwLock::new(HashMap::new())),
            handles: Arc::new(RwLock::new(HashMap::new())),
            agent_semaphore: Arc::new(Semaphore::new(max_agents)),
            max_agents,
            default_config: SubAgentConfig::default(),
            total_spawned: AtomicU64::new(0),
            restart_count: AtomicU64::new(0),
        }
    }

    /// Spawns a new sub-agent.
    pub async fn spawn(
        &self,
        config: Option<SubAgentConfig>,
    ) -> SwarmResultType<Arc<SpawnedAgent>> {
        let permit = match self.agent_semaphore.clone().try_acquire_owned() {
            Ok(permit) => permit,
            Err(_) => {
                self.reclaim_finished_agents();
                self.agent_semaphore
                    .clone()
                    .try_acquire_owned()
                    .map_err(|_| SwarmError::CapacityExceeded {
                        current: self.active_agent_count(),
                        max: self.max_agents,
                    })?
            }
        };

        let agent_id = format!("agent_{}", &Uuid::new_v4().to_string()[..8]);
        let config = config.unwrap_or_else(|| self.default_config.clone());

        tracing::info!("[AgentSpawner] Spawning agent: {}", agent_id);

        // Create task channel
        let (task_sender, task_receiver) = mpsc::channel::<AgentTask>(16);

        let stop_signal = Arc::new(AtomicBool::new(false));
        let health = Arc::new(RwLock::new(AgentHealth::Healthy));
        let current_task = Arc::new(RwLock::new(None));
        let circuit_breaker = Arc::new(CircuitBreaker::new());

        let agent = Arc::new(SpawnedAgent {
            id: agent_id.clone(),
            health: health.clone(),
            config: config.clone(),
            tasks_completed: AtomicU64::new(0),
            tasks_failed: AtomicU64::new(0),
            total_execution_time_ms: AtomicU64::new(0),
            circuit_breaker: circuit_breaker.clone(),
            task_sender,
            stop_signal: stop_signal.clone(),
            current_task: current_task.clone(),
            _permit: permit,
        });

        let handle = self.start_agent_loop(
            agent_id.clone(),
            task_receiver,
            stop_signal.clone(),
            health.clone(),
            current_task.clone(),
            circuit_breaker.clone(),
            config.clone(),
        );

        // Store agent and its handle separately (Arc prevents storing handle inside SpawnedAgent).
        self.handles.write().insert(agent_id.clone(), handle);
        self.agents.write().insert(agent_id.clone(), agent.clone());
        self.total_spawned.fetch_add(1, Ordering::SeqCst);

        tracing::info!(
            "[AgentSpawner] Agent {} spawned successfully (total: {})",
            agent_id,
            self.total_spawned.load(Ordering::SeqCst)
        );

        Ok(agent)
    }

    fn reclaim_finished_agents(&self) {
        let finished: Vec<String> = {
            let agents = self.agents.read();
            let handles = self.handles.read();
            agents
                .iter()
                .filter(|(id, agent)| {
                    *agent.health.read() == AgentHealth::Terminated
                        || handles
                            .get(*id)
                            .map(|handle| handle.is_finished())
                            .unwrap_or(true)
                })
                .map(|(id, _)| id.clone())
                .collect()
        };

        for agent_id in finished {
            self.terminate_agent(&agent_id);
        }
    }

    fn start_agent_loop(
        &self,
        agent_id: String,
        mut task_receiver: mpsc::Receiver<AgentTask>,
        stop_signal: Arc<AtomicBool>,
        health: Arc<RwLock<AgentHealth>>,
        current_task: Arc<RwLock<Option<String>>>,
        circuit_breaker: Arc<CircuitBreaker>,
        config: SubAgentConfig,
    ) -> tokio::task::JoinHandle<()> {
        let router = self.router.clone();
        let automation = self.automation.clone();
        let app_handle = self.app_handle.clone();
        let managed_auth_boundary = current_managed_auth_boundary();

        tokio::spawn(scope_managed_auth_boundary(
            managed_auth_boundary,
            async move {
                tracing::debug!("[Agent {}] Task loop started", agent_id);

                while !stop_signal.load(Ordering::SeqCst) {
                    // Wait for a task with timeout (for checking stop signal)
                    let task = tokio::select! {
                        task = task_receiver.recv() => task,
                        _ = tokio::time::sleep(Duration::from_secs(1)) => continue,
                    };

                    let task = match task {
                        Some(t) => t,
                        None => {
                            tracing::debug!("[Agent {}] Task channel closed", agent_id);
                            break;
                        }
                    };

                    // Update current task
                    *current_task.write() = Some(task.subtask.id.clone());

                    // Execute the task
                    let start = Instant::now();
                    let result = Self::execute_subtask(
                        &agent_id,
                        &task.subtask,
                        task.trust_mode,
                        router.clone(),
                        automation.clone(),
                        app_handle.clone(),
                        config.operation_timeout,
                    )
                    .await;

                    let execution_time_ms = start.elapsed().as_millis() as u64;

                    let task_result = match result {
                        Ok(value) => {
                            circuit_breaker.record_success();
                            // Completes the recovery `can_accept_task` starts:
                            // a trial task that lands puts the agent back in
                            // the healthy roster the panel and stats report.
                            *health.write() = AgentHealth::Healthy;
                            AgentTaskResult {
                                subtask_id: task.subtask.id.clone(),
                                agent_id: agent_id.clone(),
                                success: true,
                                result: Some(value),
                                error: None,
                                execution_time_ms,
                                retriable: false,
                            }
                        }
                        Err(e) => {
                            let circuit_opened = circuit_breaker.record_failure();
                            if circuit_opened {
                                *health.write() = AgentHealth::CircuitOpen;
                            }
                            AgentTaskResult {
                                subtask_id: task.subtask.id.clone(),
                                agent_id: agent_id.clone(),
                                success: false,
                                result: None,
                                error: Some(e.to_string()),
                                execution_time_ms,
                                retriable: !circuit_opened,
                            }
                        }
                    };

                    // Clear current task
                    *current_task.write() = None;

                    // Send result back
                    let _ = task.result_sender.send(task_result);
                }

                tracing::debug!("[Agent {}] Task loop ended", agent_id);
                *health.write() = AgentHealth::Terminated;
            },
        ))
    }

    /// Builds the mini-`Goal` a sub-agent submits for a subtask, carrying the
    /// parent goal's trust boundary so every sub-goal LLM call is gated the
    /// same way the originating goal was.
    pub(crate) fn subtask_goal(
        subtask: &Subtask,
        trust_mode: Option<agiworkforce_model_registry::TrustMode>,
    ) -> Goal {
        Goal {
            id: subtask.id.clone(),
            description: subtask.description.clone(),
            priority: match subtask.priority {
                super::SubtaskPriority::Low => Priority::Low,
                super::SubtaskPriority::Normal => Priority::Medium,
                super::SubtaskPriority::High => Priority::High,
                super::SubtaskPriority::Critical => Priority::Critical,
            },
            deadline: None,
            constraints: Vec::new(),
            success_criteria: vec![format!("Complete: {}", subtask.description)],
            trust_mode,
        }
    }

    /// Submits a goal and holds the sub-agent until the engine settles it.
    ///
    /// `submit_goal` only queues work, so its acknowledgement carries no
    /// verdict on the subtask; the verdict is the goal's lifecycle state,
    /// sampled until it leaves the live states or the budget expires. The whole
    /// submit-and-wait sits under one `timeout` so a subtask still answers to
    /// exactly one deadline.
    async fn settle_goal<Submission, PollState>(
        budget: Duration,
        poll_interval: Duration,
        submit: Submission,
        poll_state: PollState,
    ) -> SettledGoal
    where
        Submission: Future<Output = Result<String>>,
        PollState: Fn() -> Option<AgentTaskState>,
    {
        let settled = tokio::time::timeout(budget, async move {
            submit.await?;
            loop {
                if let Some(outcome) = poll_state().and_then(goal_outcome) {
                    return Ok::<SubtaskOutcome, anyhow::Error>(outcome);
                }
                tokio::time::sleep(poll_interval).await;
            }
        })
        .await;

        match settled {
            Ok(Ok(outcome)) => SettledGoal::Outcome(outcome),
            Ok(Err(error)) => SettledGoal::SubmitFailed(error),
            Err(_) => SettledGoal::OutOfTime,
        }
    }

    async fn execute_subtask(
        agent_id: &str,
        subtask: &Subtask,
        trust_mode: Option<agiworkforce_model_registry::TrustMode>,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        automation: Arc<AutomationService>,
        app_handle: Option<tauri::AppHandle>,
        timeout: Duration,
    ) -> Result<serde_json::Value> {
        tracing::debug!(
            "[Agent {}] Executing subtask: {} ({})",
            agent_id,
            subtask.id,
            subtask.description
        );

        // Create a mini-goal for this subtask
        let goal = Self::subtask_goal(subtask, trust_mode);
        let goal_id = goal.id.clone();

        // Create a lightweight AGI core for this subtask
        let agi_config = AGIConfig {
            max_concurrent_tools: 2,
            knowledge_memory_mb: 64,
            enable_learning: false, // Frozen agent
            enable_self_improvement: false,
            resource_limits: ResourceLimits {
                cpu_percent: 10.0,
                memory_mb: 256,
                network_mbps: 10.0,
                storage_mb: 100,
            },
            max_planning_depth: 3,
            enable_multimodal: false,
        };

        let core = AGICore::new(agi_config, router.clone(), automation.clone(), app_handle)?;

        let settled = Self::settle_goal(
            timeout,
            GOAL_COMPLETION_POLL_INTERVAL,
            core.submit_goal(goal),
            || core.get_task_state(&goal_id),
        )
        .await;

        match settled {
            SettledGoal::Outcome(SubtaskOutcome::Succeeded) => {
                tracing::debug!(
                    "[Agent {}] Subtask {} completed as goal {}",
                    agent_id,
                    subtask.id,
                    goal_id
                );
                let output = core.get_goal_status(&goal_id).and_then(|context| {
                    context.tool_results.last().map(|step| step.result.clone())
                });
                Ok(serde_json::json!({
                    "status": "completed",
                    "subtask_id": subtask.id,
                    "goal_id": goal_id,
                    "output": output,
                }))
            }
            SettledGoal::Outcome(SubtaskOutcome::Failed(reason)) => {
                tracing::warn!(
                    "[Agent {}] Subtask {} failed: {}",
                    agent_id,
                    subtask.id,
                    reason
                );
                Err(anyhow::anyhow!(reason))
            }
            SettledGoal::SubmitFailed(e) => {
                tracing::warn!("[Agent {}] Subtask {} failed: {}", agent_id, subtask.id, e);
                Err(e)
            }
            SettledGoal::OutOfTime => {
                tracing::warn!(
                    "[Agent {}] Subtask {} timed out after {:?}",
                    agent_id,
                    subtask.id,
                    timeout
                );
                // The goal worker outlives this future, so cancel it rather
                // than leaving an orphan running against the swarm's budget.
                if let Err(error) = core.cancel_goal(&goal_id).await {
                    tracing::debug!(
                        "[Agent {}] Could not cancel timed-out goal {}: {}",
                        agent_id,
                        goal_id,
                        error
                    );
                }
                Err(anyhow::anyhow!("Subtask timed out"))
            }
        }
    }

    /// Gets an available agent for task assignment.
    pub fn get_available_agent(&self) -> Option<Arc<SpawnedAgent>> {
        let agents = self.agents.read();
        agents
            .values()
            .find(|agent| agent.can_accept_task())
            .cloned()
    }

    /// Gets all healthy agents.
    pub fn get_healthy_agents(&self) -> Vec<Arc<SpawnedAgent>> {
        let agents = self.agents.read();
        agents
            .values()
            .filter(|agent| *agent.health.read() == AgentHealth::Healthy)
            .cloned()
            .collect()
    }

    /// Gets the number of active agents.
    pub fn active_agent_count(&self) -> usize {
        let agents = self.agents.read();
        agents
            .values()
            .filter(|a| *a.health.read() != AgentHealth::Terminated)
            .count()
    }

    /// Terminates an agent, aborting its task loop immediately.
    pub fn terminate_agent(&self, agent_id: &str) {
        if let Some(agent) = self.agents.write().remove(agent_id) {
            // Set the cooperative stop signal first so the loop exits cleanly if mid-wait.
            agent.stop();
            // Abort the task handle for immediate termination regardless of current I/O.
            if let Some(handle) = self.handles.write().remove(agent_id) {
                handle.abort();
            }
            tracing::info!("[AgentSpawner] Agent {} terminated", agent_id);
        }
    }

    /// Terminates all agents, aborting their task loops immediately.
    pub fn terminate_all(&self) {
        let mut agents = self.agents.write();
        let mut handles = self.handles.write();
        for (id, agent) in agents.drain() {
            agent.stop();
            if let Some(handle) = handles.remove(&id) {
                handle.abort();
            }
            tracing::debug!("[AgentSpawner] Agent {} terminated", id);
        }
        tracing::info!("[AgentSpawner] All agents terminated");
    }

    /// Restarts a failed agent.
    pub async fn restart_agent(&self, agent_id: &str) -> SwarmResultType<Arc<SpawnedAgent>> {
        // Get the old config if available
        let old_config = self.agents.read().get(agent_id).map(|a| a.config.clone());

        // Terminate the old agent
        self.terminate_agent(agent_id);

        // Spawn a new one
        let new_agent = self.spawn(old_config).await?;
        self.restart_count.fetch_add(1, Ordering::SeqCst);

        tracing::info!(
            "[AgentSpawner] Agent restarted: {} -> {}",
            agent_id,
            new_agent.id
        );

        Ok(new_agent)
    }

    /// Gets statistics about spawned agents.
    pub fn get_stats(&self) -> AgentSpawnerStats {
        let agents = self.agents.read();

        let mut healthy = 0;
        let mut degraded = 0;
        let mut circuit_open = 0;
        let mut recovering = 0;
        let mut terminated = 0;
        let mut total_tasks_completed = 0;
        let mut total_tasks_failed = 0;
        let mut total_execution_time_ms = 0;
        let mut total_circuit_breaker_trips = 0;

        for agent in agents.values() {
            match *agent.health.read() {
                AgentHealth::Healthy => healthy += 1,
                AgentHealth::Degraded => degraded += 1,
                AgentHealth::CircuitOpen => circuit_open += 1,
                AgentHealth::Recovering => recovering += 1,
                AgentHealth::Terminated => terminated += 1,
            }
            total_tasks_completed += agent.tasks_completed.load(Ordering::SeqCst);
            total_tasks_failed += agent.tasks_failed.load(Ordering::SeqCst);
            total_execution_time_ms += agent.total_execution_time_ms.load(Ordering::SeqCst);
            total_circuit_breaker_trips += agent.get_circuit_breaker_trips();
        }

        AgentSpawnerStats {
            total_spawned: self.total_spawned.load(Ordering::SeqCst),
            currently_active: agents.len(),
            healthy,
            degraded,
            circuit_open,
            recovering,
            terminated,
            total_tasks_completed,
            total_tasks_failed,
            total_execution_time_ms,
            restart_count: self.restart_count.load(Ordering::SeqCst),
            circuit_breaker_trips: total_circuit_breaker_trips,
        }
    }
}

/// Statistics about the agent spawner.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSpawnerStats {
    pub total_spawned: u64,
    pub currently_active: usize,
    pub healthy: usize,
    pub degraded: usize,
    pub circuit_open: usize,
    pub recovering: usize,
    pub terminated: usize,
    pub total_tasks_completed: u64,
    pub total_tasks_failed: u64,
    pub total_execution_time_ms: u64,
    pub restart_count: u64,
    pub circuit_breaker_trips: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circuit_breaker() {
        let cb = CircuitBreaker::new();

        // Initially should allow requests
        assert!(cb.allow_request());

        // Record failures up to threshold
        for _ in 0..constants::CIRCUIT_BREAKER_THRESHOLD - 1 {
            assert!(!cb.record_failure()); // Should not open yet
            assert!(cb.allow_request());
        }

        // This failure should open the circuit
        assert!(cb.record_failure());
        assert!(!cb.allow_request());

        // Success should reset
        cb.record_success();
        assert!(cb.allow_request());
    }

    #[test]
    fn test_subagent_config_default() {
        let config = SubAgentConfig::default();
        assert!(config.frozen);
        assert_eq!(config.max_concurrent_tasks, 1);
    }

    const TEST_POLL_INTERVAL: Duration = Duration::from_millis(5);
    const TEST_SUBTASK_BUDGET: Duration = Duration::from_millis(120);
    const TEST_CIRCUIT_RESET: Duration = Duration::from_millis(40);
    const TEST_POLLS_BEFORE_THE_ENGINE_FINISHES: usize = 3;

    async fn submission_accepted() -> Result<String> {
        Ok("goal_1".to_string())
    }

    async fn submission_rejected() -> Result<String> {
        Err(anyhow::anyhow!("engine refused the goal"))
    }

    fn test_agent(
        circuit_breaker: Arc<CircuitBreaker>,
    ) -> (SpawnedAgent, mpsc::Receiver<AgentTask>) {
        let (task_sender, task_receiver) = mpsc::channel::<AgentTask>(1);
        let permit = Arc::new(Semaphore::new(1))
            .try_acquire_owned()
            .expect("capacity available");

        let agent = SpawnedAgent {
            id: "agent_test".to_string(),
            health: Arc::new(RwLock::new(AgentHealth::Healthy)),
            config: SubAgentConfig::default(),
            tasks_completed: AtomicU64::new(0),
            tasks_failed: AtomicU64::new(0),
            total_execution_time_ms: AtomicU64::new(0),
            circuit_breaker,
            task_sender,
            stop_signal: Arc::new(AtomicBool::new(false)),
            current_task: Arc::new(RwLock::new(None)),
            _permit: permit,
        };

        (agent, task_receiver)
    }

    #[test]
    fn test_goal_outcome_reports_finished_work_as_success() {
        for state in [
            AgentTaskState::ReadyForReview,
            AgentTaskState::Completed,
            AgentTaskState::Archived,
        ] {
            assert_eq!(goal_outcome(state), Some(SubtaskOutcome::Succeeded));
        }
    }

    #[test]
    fn test_goal_outcome_succeeds_on_the_non_terminal_ready_for_review() {
        assert!(!AgentTaskState::ReadyForReview.is_terminal());
        assert_eq!(
            goal_outcome(AgentTaskState::ReadyForReview),
            Some(SubtaskOutcome::Succeeded)
        );
    }

    #[test]
    fn test_goal_outcome_reports_unfinished_work_as_failure() {
        for state in [
            AgentTaskState::Failed,
            AgentTaskState::Cancelled,
            AgentTaskState::AwaitingInput,
        ] {
            assert!(matches!(
                goal_outcome(state),
                Some(SubtaskOutcome::Failed(_))
            ));
        }
    }

    #[test]
    fn test_goal_outcome_keeps_waiting_while_the_goal_is_live() {
        for state in [
            AgentTaskState::Queued,
            AgentTaskState::Running,
            AgentTaskState::Paused,
        ] {
            assert_eq!(goal_outcome(state), None);
        }
    }

    #[tokio::test]
    async fn test_submission_acknowledgement_alone_never_settles_a_subtask() {
        let settled = AgentSpawner::settle_goal(
            TEST_SUBTASK_BUDGET,
            TEST_POLL_INTERVAL,
            submission_accepted(),
            || Some(AgentTaskState::Running),
        )
        .await;

        assert!(matches!(settled, SettledGoal::OutOfTime));
    }

    #[tokio::test]
    async fn test_subtask_settles_only_once_the_engine_finishes_the_goal() {
        let polls = Arc::new(AtomicU32::new(0));
        let observed = polls.clone();

        let settled = AgentSpawner::settle_goal(
            TEST_SUBTASK_BUDGET,
            TEST_POLL_INTERVAL,
            submission_accepted(),
            move || {
                let seen = observed.fetch_add(1, Ordering::SeqCst) as usize;
                if seen + 1 < TEST_POLLS_BEFORE_THE_ENGINE_FINISHES {
                    Some(AgentTaskState::Running)
                } else {
                    Some(AgentTaskState::ReadyForReview)
                }
            },
        )
        .await;

        assert!(matches!(
            settled,
            SettledGoal::Outcome(SubtaskOutcome::Succeeded)
        ));
        assert_eq!(
            polls.load(Ordering::SeqCst) as usize,
            TEST_POLLS_BEFORE_THE_ENGINE_FINISHES
        );
    }

    #[tokio::test]
    async fn test_subtask_settles_as_failed_when_the_engine_gives_up() {
        let settled = AgentSpawner::settle_goal(
            TEST_SUBTASK_BUDGET,
            TEST_POLL_INTERVAL,
            submission_accepted(),
            || Some(AgentTaskState::Failed),
        )
        .await;

        assert!(matches!(
            settled,
            SettledGoal::Outcome(SubtaskOutcome::Failed(_))
        ));
    }

    #[tokio::test]
    async fn test_rejected_submission_is_reported_without_waiting() {
        let settled = AgentSpawner::settle_goal(
            TEST_SUBTASK_BUDGET,
            TEST_POLL_INTERVAL,
            submission_rejected(),
            || Some(AgentTaskState::ReadyForReview),
        )
        .await;

        assert!(matches!(settled, SettledGoal::SubmitFailed(_)));
    }

    #[test]
    fn test_busy_agent_is_not_offered_more_work() {
        let (agent, _task_receiver) = test_agent(Arc::new(CircuitBreaker::new()));

        assert!(agent.can_accept_task());

        *agent.current_task.write() = Some("subtask_1".to_string());
        assert!(!agent.can_accept_task());

        agent.record_success(1);
        assert!(agent.can_accept_task());
    }

    #[test]
    fn test_tripped_agent_returns_to_service_when_the_breaker_reopens() {
        let breaker = CircuitBreaker {
            reset_timeout: TEST_CIRCUIT_RESET,
            ..CircuitBreaker::new()
        };
        let (agent, _task_receiver) = test_agent(Arc::new(breaker));

        for _ in 0..constants::CIRCUIT_BREAKER_THRESHOLD {
            agent.record_failure();
        }

        assert_eq!(*agent.health.read(), AgentHealth::CircuitOpen);
        assert!(!agent.can_accept_task());

        std::thread::sleep(TEST_CIRCUIT_RESET + TEST_POLL_INTERVAL);

        // The capacity permit an agent holds is only reclaimed by dropping the
        // agent, so a trip that could never be walked back would retire a
        // `max_agents` slot for the life of the process.
        assert!(agent.can_accept_task());
    }
}
