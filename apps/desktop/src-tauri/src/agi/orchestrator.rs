use super::*;
use crate::automation::AutomationService;
use crate::router::LLMRouter;
use anyhow::{anyhow, Result};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;
use tokio::task::JoinHandle;
use uuid::Uuid;

/// Agent state enumeration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AgentState {
    Idle,
    Running,
    Paused,
    Completed,
    Failed,
}

/// Agent status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub id: String,
    pub name: String,
    pub status: AgentState,
    pub current_goal: Option<String>,
    pub current_step: Option<String>,
    pub progress: u8, // 0-100
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub error: Option<String>,
}

/// Agent execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResult {
    pub agent_id: String,
    pub success: bool,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub execution_time_ms: u64,
}

/// Coordination pattern for multi-agent execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CoordinationPattern {
    /// Run all agents in parallel (default)
    Parallel,
    /// Run agents sequentially, one after another
    Sequential,
    /// Run agents conditionally based on previous results
    Conditional { condition: String },
    /// Supervisor-worker pattern: one agent delegates to others
    SupervisorWorker { supervisor_id: String },
}

/// Resource lock manager to prevent conflicts between agents
#[derive(Debug, Clone)]
pub struct ResourceLock {
    file_locks: Arc<RwLock<HashSet<PathBuf>>>,
    ui_element_locks: Arc<RwLock<HashSet<String>>>,
}

impl ResourceLock {
    pub fn new() -> Self {
        Self {
            file_locks: Arc::new(RwLock::new(HashSet::new())),
            ui_element_locks: Arc::new(RwLock::new(HashSet::new())),
        }
    }

    /// Attempt to acquire a file lock
    pub fn try_acquire_file(&self, path: &PathBuf) -> Result<FileGuard> {
        let mut locks = self.file_locks.write();
        if locks.contains(path) {
            return Err(anyhow!("File {} is already locked", path.display()));
        }
        locks.insert(path.clone());
        Ok(FileGuard {
            path: path.clone(),
            locks: self.file_locks.clone(),
        })
    }

    /// Attempt to acquire a UI element lock
    pub fn try_acquire_ui_element(&self, selector: &str) -> Result<UiGuard> {
        let mut locks = self.ui_element_locks.write();
        if locks.contains(selector) {
            return Err(anyhow!("UI element '{}' is already locked", selector));
        }
        locks.insert(selector.to_string());
        Ok(UiGuard {
            selector: selector.to_string(),
            locks: self.ui_element_locks.clone(),
        })
    }

    /// Check if a file is locked
    pub fn is_file_locked(&self, path: &PathBuf) -> bool {
        self.file_locks.read().contains(path)
    }

    /// Check if a UI element is locked
    pub fn is_ui_element_locked(&self, selector: &str) -> bool {
        self.ui_element_locks.read().contains(selector)
    }
}

/// RAII guard for file locks
pub struct FileGuard {
    path: PathBuf,
    locks: Arc<RwLock<HashSet<PathBuf>>>,
}

impl Drop for FileGuard {
    fn drop(&mut self) {
        self.locks.write().remove(&self.path);
    }
}

/// RAII guard for UI element locks
pub struct UiGuard {
    selector: String,
    locks: Arc<RwLock<HashSet<String>>>,
}

impl Drop for UiGuard {
    fn drop(&mut self) {
        self.locks.write().remove(&self.selector);
    }
}

/// Running agent instance
struct AgentInstance {
    id: String,
    name: String,
    goal: Goal,
    core: AGICore,
    status: AgentStatus,
    handle: Option<JoinHandle<Result<serde_json::Value>>>,
}

/// Agent Orchestrator - manages multiple concurrent agents
pub struct AgentOrchestrator {
    max_agents: usize,
    agents: Arc<TokioMutex<HashMap<String, AgentInstance>>>,
    resource_lock: ResourceLock,
    knowledge_base: Arc<RwLock<KnowledgeBase>>,
    config: AGIConfig,
    router: Arc<TokioMutex<LLMRouter>>,
    automation: Arc<AutomationService>,
    app_handle: Option<tauri::AppHandle>,
}

impl AgentOrchestrator {
    /// Create a new agent orchestrator
    pub fn new(
        max_agents: usize,
        config: AGIConfig,
        router: Arc<TokioMutex<LLMRouter>>,
        automation: Arc<AutomationService>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<Self> {
        // Create shared knowledge base with RwLock for thread-safe concurrent access
        let knowledge_base = Arc::new(RwLock::new(KnowledgeBase::new(
            config.knowledge_memory_mb,
        )?));

        Ok(Self {
            max_agents,
            agents: Arc::new(TokioMutex::new(HashMap::new())),
            resource_lock: ResourceLock::new(),
            knowledge_base,
            config,
            router,
            automation,
            app_handle,
        })
    }

    /// Spawn a new agent with a specific goal
    pub async fn spawn_agent(&self, goal: Goal) -> Result<String> {
        let mut agents = self.agents.lock().await;

        // Check if we've reached max capacity
        if agents.len() >= self.max_agents {
            return Err(anyhow!(
                "Maximum agent capacity ({}) reached. Cancel or wait for existing agents to complete.",
                self.max_agents
            ));
        }

        let agent_id = format!("agent_{}", &Uuid::new_v4().to_string()[..8]);
        let agent_name = format!("Agent {}", agents.len() + 1);

        tracing::info!(
            "[Orchestrator] Spawning agent {} for goal: {}",
            agent_id,
            goal.description
        );

        // Create isolated AGI core for this agent
        let core = AGICore::new(
            self.config.clone(),
            self.router.clone(),
            self.automation.clone(),
            self.app_handle.clone(),
        )?;

        // Create agent status
        let status = AgentStatus {
            id: agent_id.clone(),
            name: agent_name.clone(),
            status: AgentState::Running,
            current_goal: Some(goal.description.clone()),
            current_step: None,
            progress: 0,
            started_at: Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64,
            ),
            completed_at: None,
            error: None,
        };

        // Store goal in shared knowledge base (with RwLock)
        {
            let kb = self.knowledge_base.write();
            kb.add_goal(&goal).await?;
        }

        // Emit agent spawned event
        if let Some(ref app) = self.app_handle {
            let _ = app.emit(
                "agent:spawned",
                serde_json::json!({
                    "agent_id": &agent_id,
                    "goal": &goal.description,
                }),
            );
        }

        // Create agent instance (task will be spawned when we submit the goal)
        let agent = AgentInstance {
            id: agent_id.clone(),
            name: agent_name,
            goal: goal.clone(),
            core,
            status,
            handle: None,
        };

        agents.insert(agent_id.clone(), agent);

        // Submit goal to the agent's core (this will spawn the execution task)
        let agent = agents.get_mut(&agent_id).unwrap();
        let goal_id = agent.core.submit_goal(goal).await?;

        tracing::info!(
            "[Orchestrator] Agent {} started with goal_id: {}",
            agent_id,
            goal_id
        );

        Ok(agent_id)
    }

    /// Spawn multiple agents in parallel
    pub async fn spawn_parallel(&self, goals: Vec<Goal>) -> Result<Vec<String>> {
        let mut agent_ids = Vec::new();

        for goal in goals {
            let agent_id = self.spawn_agent(goal).await?;
            agent_ids.push(agent_id);
        }

        Ok(agent_ids)
    }

    /// Get status of a specific agent
    pub async fn get_agent_status(&self, id: &str) -> Option<AgentStatus> {
        let agents = self.agents.lock().await;
        agents.get(id).map(|agent| {
            // Get the latest goal status from the agent's core
            let mut status = agent.status.clone();
            if let Some(goal_context) = agent.core.get_goal_status(&agent.goal.id) {
                // Calculate progress based on completed steps
                let total_results = goal_context.tool_results.len();
                if total_results > 0 {
                    // Estimate progress (simple heuristic)
                    status.progress = std::cmp::min(total_results as u8 * 10, 90);
                }
                // Get current step from the latest context entry
                if let Some(entry) = goal_context.context_memory.last() {
                    status.current_step = Some(entry.event.clone());
                }
            }
            status
        })
    }

    /// List all active agents
    pub async fn list_active_agents(&self) -> Vec<AgentStatus> {
        let agents = self.agents.lock().await;
        let mut statuses = Vec::new();

        for agent in agents.values() {
            let mut status = agent.status.clone();

            // Update status from core
            if let Some(goal_context) = agent.core.get_goal_status(&agent.goal.id) {
                let total_results = goal_context.tool_results.len();
                if total_results > 0 {
                    status.progress = std::cmp::min(total_results as u8 * 10, 90);
                }
                if let Some(entry) = goal_context.context_memory.last() {
                    status.current_step = Some(entry.event.clone());
                }
            }

            statuses.push(status);
        }

        statuses
    }

    /// Cancel a specific agent
    pub async fn cancel_agent(&self, id: &str) -> Result<()> {
        let mut agents = self.agents.lock().await;

        if let Some(agent) = agents.get_mut(id) {
            tracing::info!("[Orchestrator] Cancelling agent {}", id);

            // Stop the agent's core
            agent.core.stop();

            // Update status
            agent.status.status = AgentState::Failed;
            agent.status.error = Some("Cancelled by user".to_string());
            agent.status.completed_at = Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64,
            );

            // Emit cancelled event
            if let Some(ref app) = self.app_handle {
                let _ = app.emit(
                    "agent:cancelled",
                    serde_json::json!({
                        "agent_id": id,
                    }),
                );
            }

            Ok(())
        } else {
            Err(anyhow!("Agent {} not found", id))
        }
    }

    /// Cancel all agents
    pub async fn cancel_all_agents(&self) -> Result<()> {
        let agent_ids: Vec<String> = {
            let agents = self.agents.lock().await;
            agents.keys().cloned().collect()
        };

        for agent_id in agent_ids {
            self.cancel_agent(&agent_id).await?;
        }

        Ok(())
    }

    /// Wait for all agents to complete
    pub async fn wait_for_all(&self) -> Vec<AgentResult> {
        let mut results = Vec::new();

        loop {
            let agent_ids: Vec<String> = {
                let agents = self.agents.lock().await;
                agents.keys().cloned().collect()
            };

            if agent_ids.is_empty() {
                break;
            }

            // Check status of each agent
            for agent_id in &agent_ids {
                if let Some(status) = self.get_agent_status(agent_id).await {
                    if status.status == AgentState::Completed
                        || status.status == AgentState::Failed
                    {
                        // Collect result
                        let result = AgentResult {
                            agent_id: agent_id.clone(),
                            success: status.status == AgentState::Completed,
                            result: None, // TODO: Extract actual result from core
                            error: status.error,
                            execution_time_ms: if let (Some(start), Some(end)) =
                                (status.started_at, status.completed_at)
                            {
                                ((end - start) * 1000) as u64
                            } else {
                                0
                            },
                        };
                        results.push(result);

                        // Remove completed agent
                        let mut agents = self.agents.lock().await;
                        agents.remove(agent_id);
                    }
                }
            }

            // Sleep briefly before checking again
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        results
    }

    /// Get resource lock manager
    pub fn get_resource_lock(&self) -> &ResourceLock {
        &self.resource_lock
    }

    /// Get shared knowledge base (read-only access)
    pub fn get_knowledge_base(&self) -> Arc<RwLock<KnowledgeBase>> {
        self.knowledge_base.clone()
    }

    /// Cleanup completed agents
    pub async fn cleanup_completed(&self) -> Result<usize> {
        let mut agents = self.agents.lock().await;
        let mut removed = 0;

        let agent_ids: Vec<String> = agents.keys().cloned().collect();

        for agent_id in agent_ids {
            if let Some(agent) = agents.get(&agent_id) {
                if agent.status.status == AgentState::Completed
                    || agent.status.status == AgentState::Failed
                {
                    agents.remove(&agent_id);
                    removed += 1;
                }
            }
        }

        tracing::info!("[Orchestrator] Cleaned up {} completed agents", removed);
        Ok(removed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resource_lock_file() {
        let resource_lock = ResourceLock::new();
        let path = PathBuf::from("/test/file.txt");

        // First lock should succeed
        let _guard1 = resource_lock.try_acquire_file(&path).unwrap();
        assert!(resource_lock.is_file_locked(&path));

        // Second lock should fail
        assert!(resource_lock.try_acquire_file(&path).is_err());

        // After dropping guard, lock should be released
        drop(_guard1);
        assert!(!resource_lock.is_file_locked(&path));
    }

    #[test]
    fn test_resource_lock_ui_element() {
        let resource_lock = ResourceLock::new();
        let selector = "#submit-button";

        // First lock should succeed
        let _guard1 = resource_lock.try_acquire_ui_element(selector).unwrap();
        assert!(resource_lock.is_ui_element_locked(selector));

        // Second lock should fail
        assert!(resource_lock.try_acquire_ui_element(selector).is_err());

        // After dropping guard, lock should be released
        drop(_guard1);
        assert!(!resource_lock.is_ui_element_locked(selector));
    }
}
