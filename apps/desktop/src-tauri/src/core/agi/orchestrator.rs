use super::*;
use crate::automation::AutomationService;
use crate::core::llm::LLMRouter;
use crate::features::document::pdf::PdfHandler;
use crate::sys::commands::chat::ChatAttachment;
use anyhow::{anyhow, Result};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex as TokioMutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AgentState {
    Idle,
    Running,
    Paused,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub id: String,
    pub name: String,
    pub status: AgentState,
    pub current_goal: Option<String>,
    pub current_step: Option<String>,
    pub progress: u8,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResult {
    pub agent_id: String,
    pub success: bool,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub execution_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorResult {
    pub success: bool,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CoordinationPattern {
    Parallel,

    Sequential,

    Conditional { condition: String },

    SupervisorWorker { supervisor_id: String },
}

#[derive(Debug, Clone)]
pub struct ResourceLock {
    file_locks: Arc<RwLock<HashSet<PathBuf>>>,
    ui_element_locks: Arc<RwLock<HashSet<String>>>,
}

impl Default for ResourceLock {
    fn default() -> Self {
        Self::new()
    }
}

impl ResourceLock {
    pub fn new() -> Self {
        Self {
            file_locks: Arc::new(RwLock::new(HashSet::new())),
            ui_element_locks: Arc::new(RwLock::new(HashSet::new())),
        }
    }

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

    pub fn is_file_locked(&self, path: &PathBuf) -> bool {
        self.file_locks.read().contains(path)
    }

    pub fn is_ui_element_locked(&self, selector: &str) -> bool {
        self.ui_element_locks.read().contains(selector)
    }
}

pub struct FileGuard {
    path: PathBuf,
    locks: Arc<RwLock<HashSet<PathBuf>>>,
}

impl Drop for FileGuard {
    fn drop(&mut self) {
        self.locks.write().remove(&self.path);
    }
}

pub struct UiGuard {
    selector: String,
    locks: Arc<RwLock<HashSet<String>>>,
}

impl Drop for UiGuard {
    fn drop(&mut self) {
        self.locks.write().remove(&self.selector);
    }
}

struct AgentInstance {
    goal: Goal,
    core: AGICore,
    status: AgentStatus,
}

pub struct AgentOrchestrator {
    max_agents: usize,
    agents: Arc<TokioMutex<HashMap<String, AgentInstance>>>,
    resource_lock: ResourceLock,
    knowledge_base: Arc<KnowledgeBase>,
    config: AGIConfig,
    router: Arc<tokio::sync::RwLock<LLMRouter>>,
    automation: Arc<AutomationService>,
    app_handle: Option<tauri::AppHandle>,
}

impl AgentOrchestrator {
    pub fn new(
        max_agents: usize,
        config: AGIConfig,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        automation: Arc<AutomationService>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<Self> {
        let knowledge_base = Arc::new(KnowledgeBase::new(config.knowledge_memory_mb)?);

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

    pub async fn spawn_agent(&self, goal: Goal) -> Result<String> {
        // Phase 1: Acquire lock only for capacity check and ID generation,
        // then release before any awaits to avoid holding mutex across await points.
        let (agent_id, agent_name) = {
            let agents = self.agents.lock().await;

            if agents.len() >= self.max_agents {
                return Err(anyhow!(
                    "Maximum agent capacity ({}) reached. Cancel or wait for existing agents to complete.",
                    self.max_agents
                ));
            }

            let agent_id = format!("agent_{}", &Uuid::new_v4().to_string()[..8]);
            let agent_name = format!("Agent {}", agents.len() + 1);
            (agent_id, agent_name)
            // Lock released here
        };

        tracing::info!(
            "[Orchestrator] Spawning agent {} for goal: {}",
            agent_id,
            goal.description
        );

        let core = AGICore::new(
            self.config.clone(),
            self.router.clone(),
            self.automation.clone(),
            self.app_handle.clone(),
        )?;

        let status = AgentStatus {
            id: agent_id.clone(),
            name: agent_name.clone(),
            status: AgentState::Running,
            current_goal: Some(goal.description.clone()),
            current_step: None,
            progress: 0,
            // AUDIT-P3-004: Use unwrap_or_default() for timestamp to avoid panic
            started_at: Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0),
            ),
            completed_at: None,
            error: None,
        };

        // Perform awaits outside the lock to prevent deadlocks
        self.knowledge_base.add_goal(&goal).await?;

        if let Some(ref app) = self.app_handle {
            let _ = app.emit(
                "agent:spawned",
                serde_json::json!({
                    "agent_id": &agent_id,
                    "goal": &goal.description,
                }),
            );
        }

        let agent = AgentInstance {
            goal: goal.clone(),
            core,
            status,
        };

        // Phase 2: Reacquire lock for insertion and goal submission
        let mut agents = self.agents.lock().await;
        agents.insert(agent_id.clone(), agent);

        // AUDIT-P3-005: Use ok_or_else instead of unwrap() for map access
        let agent = agents
            .get_mut(&agent_id)
            .ok_or_else(|| anyhow::anyhow!("Agent not found after insertion"))?;
        let goal_id = agent.core.submit_goal(goal).await?;

        tracing::info!(
            "[Orchestrator] Agent {} started with goal_id: {}",
            agent_id,
            goal_id
        );

        Ok(agent_id)
    }

    pub async fn spawn_parallel(&self, goals: Vec<Goal>) -> Result<Vec<String>> {
        let mut agent_ids = Vec::new();

        for goal in goals {
            let agent_id = self.spawn_agent(goal).await?;
            agent_ids.push(agent_id);
        }

        Ok(agent_ids)
    }

    pub async fn get_agent_result(&self, id: &str) -> Option<AgentResult> {
        let agents = self.agents.lock().await;

        if let Some(agent) = agents.get(id) {
            let status = &agent.status;

            // Extract the result if available (borrowed logic from wait_for_all)
            let final_output = if let Some(ctx) = agent.core.get_goal_status(&agent.goal.id) {
                ctx.tool_results.last().map(|tr| tr.result.clone())
            } else {
                None
            };

            let result = AgentResult {
                agent_id: id.to_string(),
                success: status.status == AgentState::Completed,
                result: final_output,
                error: status.error.clone(),
                execution_time_ms: if let (Some(start), Some(end)) =
                    (status.started_at, status.completed_at)
                {
                    ((end - start) * 1000) as u64
                } else {
                    0
                },
            };

            return Some(result);
        }

        None
    }

    pub async fn get_agent_status(&self, id: &str) -> Option<AgentStatus> {
        let agents = self.agents.lock().await;
        agents.get(id).map(|agent| {
            let mut status = agent.status.clone();
            if let Some(goal_context) = agent.core.get_goal_status(&agent.goal.id) {
                let total_results = goal_context.tool_results.len();
                if total_results > 0 {
                    status.progress = std::cmp::min(total_results as u8 * 10, 90);
                }

                if let Some(entry) = goal_context.context_memory.last() {
                    status.current_step = Some(entry.event.clone());
                }
            }
            status
        })
    }

    pub async fn list_active_agents(&self) -> Vec<AgentStatus> {
        let agents = self.agents.lock().await;
        let mut statuses = Vec::new();

        for agent in agents.values() {
            let mut status = agent.status.clone();

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

    pub async fn list_agents(&self) -> Result<Vec<AgentStatus>> {
        Ok(self.list_active_agents().await)
    }

    pub async fn cancel_agent(&self, id: &str) -> Result<()> {
        let mut agents = self.agents.lock().await;

        if let Some(agent) = agents.get_mut(id) {
            tracing::info!("[Orchestrator] Cancelling agent {}", id);

            agent.core.stop();

            agent.status.status = AgentState::Failed;
            agent.status.error = Some("Cancelled by user".to_string());
            // AUDIT-P3-011: Use unwrap_or(0) for timestamp to avoid panic
            agent.status.completed_at = Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0),
            );

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

    pub async fn pause_agent(&self, id: &str) -> Result<()> {
        let mut agents = self.agents.lock().await;

        if let Some(agent) = agents.get_mut(id) {
            if agent.status.status != AgentState::Running {
                return Err(anyhow!(
                    "Agent {} cannot be paused (current state: {:?})",
                    id,
                    agent.status.status
                ));
            }

            tracing::info!("[Orchestrator] Pausing agent {}", id);

            agent.core.pause();

            agent.status.status = AgentState::Paused;

            if let Some(ref app) = self.app_handle {
                let _ = app.emit(
                    "agent:paused",
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

    pub async fn resume_agent(&self, id: &str) -> Result<()> {
        let mut agents = self.agents.lock().await;

        if let Some(agent) = agents.get_mut(id) {
            if agent.status.status != AgentState::Paused {
                return Err(anyhow!(
                    "Agent {} is not paused (current state: {:?})",
                    id,
                    agent.status.status
                ));
            }

            tracing::info!("[Orchestrator] Resuming agent {}", id);

            agent.core.resume();

            agent.status.status = AgentState::Running;

            if let Some(ref app) = self.app_handle {
                let _ = app.emit(
                    "agent:resumed",
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

    /// Cancel all agents. Uses a loop that processes one agent at a time
    /// to avoid TOCTOU race conditions where new agents could be spawned
    /// between getting the list and cancelling.
    pub async fn cancel_all_agents(&self) -> Result<()> {
        // Process agents one at a time to avoid TOCTOU issues
        // Each iteration gets a fresh view of the agent list
        loop {
            let agent_id: Option<String> = {
                let agents = self.agents.lock().await;
                agents.keys().next().cloned()
            };

            match agent_id {
                Some(id) => {
                    // Ignore errors for individual cancellations
                    // (agent might have already completed/been removed)
                    let _ = self.cancel_agent(&id).await;
                }
                None => break,
            }
        }

        Ok(())
    }

    /// Wait for all agents to complete. This method uses a single lock
    /// per iteration to avoid nested lock issues and potential deadlocks.
    pub async fn wait_for_all(&self) -> Vec<AgentResult> {
        let mut results = Vec::new();

        loop {
            // Use a single lock acquisition to check status AND collect results
            // This avoids the nested lock issue from the previous implementation
            let completed_agents: Vec<(String, AgentResult)> = {
                let mut agents = self.agents.lock().await;

                if agents.is_empty() {
                    break;
                }

                // Find completed agents within the lock
                let mut completed = Vec::new();
                let agent_ids: Vec<String> = agents.keys().cloned().collect();

                for agent_id in agent_ids {
                    if let Some(agent) = agents.get(&agent_id) {
                        let status = &agent.status;
                        if status.status == AgentState::Completed
                            || status.status == AgentState::Failed
                        {
                            let final_output =
                                if let Some(ctx) = agent.core.get_goal_status(&agent.goal.id) {
                                    ctx.tool_results.last().map(|tr| tr.result.clone())
                                } else {
                                    None
                                };

                            let result = AgentResult {
                                agent_id: agent_id.clone(),
                                success: status.status == AgentState::Completed,
                                result: final_output,
                                error: status.error.clone(),
                                execution_time_ms: if let (Some(start), Some(end)) =
                                    (status.started_at, status.completed_at)
                                {
                                    ((end - start) * 1000) as u64
                                } else {
                                    0
                                },
                            };
                            completed.push((agent_id.clone(), result));
                        }
                    }
                }

                // Remove completed agents while still holding the lock
                for (agent_id, _) in &completed {
                    agents.remove(agent_id);
                }

                completed
            }; // Lock released here

            // Add results outside the lock
            for (_, result) in completed_agents {
                results.push(result);
            }

            // Check if we're done (need to re-check since we released lock)
            {
                let agents = self.agents.lock().await;
                if agents.is_empty() {
                    break;
                }
            }

            // Sleep outside the lock to allow other operations
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        results
    }

    pub fn get_resource_lock(&self) -> &ResourceLock {
        &self.resource_lock
    }

    pub fn get_knowledge_base(&self) -> Arc<KnowledgeBase> {
        self.knowledge_base.clone()
    }

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

    pub async fn process_instruction(
        &self,
        instruction: &str,
        attachments: Option<Vec<ChatAttachment>>,
    ) -> Result<OrchestratorResult> {
        tracing::info!("[Orchestrator] Processing instruction: {}", instruction);

        let mut enriched_instruction = instruction.to_string();

        if let Some(atts) = attachments {
            for attachment in atts {
                if let Some(path) = &attachment.path {
                    let path_lower = path.to_lowercase();
                    if path_lower.ends_with(".pdf") {
                        tracing::info!(
                            "[Orchestrator] Extracting text from PDF attachment: {}",
                            path
                        );
                        let pdf_handler = PdfHandler::new();
                        match pdf_handler.extract_text(path).await {
                            Ok(text) => {
                                let truncated_text = if text.len() > 10000 {
                                    format!("{}... (truncated)", &text[..10000])
                                } else {
                                    text
                                };
                                enriched_instruction.push_str(&format!(
                                    "\n\n[Attachment Content: {}]\n{}\n[End Attachment]\n",
                                    attachment.name, truncated_text
                                ));
                            }
                            Err(e) => {
                                tracing::error!("Failed to extract PDF text: {}", e);
                                enriched_instruction.push_str(&format!(
                                    "\n\n[System Note: Failed to extract text from attachment: {} - {}]\n",
                                    attachment.name, e
                                ));
                            }
                        }
                    }
                }
            }
        }

        let goal = Goal {
            id: format!("goal_{}", &Uuid::new_v4().to_string()[..8]),
            description: enriched_instruction,
            priority: Priority::Medium,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![],
        };

        let agent_id = self.spawn_agent(goal.clone()).await?;

        let max_attempts = 1200; // 1200 * 100ms = 120 seconds (matches frontend default)
        let mut result = OrchestratorResult {
            success: false,
            summary: "Task execution timed out after 120 seconds.".to_string(),
        };

        'poll: for _ in 0..max_attempts {
            if let Some(status) = self.get_agent_status(&agent_id).await {
                if status.status == AgentState::Completed {
                    // Build summary from tool results — drop the lock before breaking
                    let summary = {
                        let agents = self.agents.lock().await;
                        if let Some(agent) = agents.get(&agent_id) {
                            if let Some(goal_context) = agent.core.get_goal_status(&goal.id) {
                                let mut summary_parts = Vec::new();
                                for tool_result in &goal_context.tool_results {
                                    if tool_result.success {
                                        if let Some(result_str) = tool_result.result.as_str() {
                                            if !result_str.is_empty() {
                                                summary_parts.push(result_str.to_string());
                                            }
                                        } else {
                                            summary_parts.push(format!(
                                                "Completed: {}",
                                                tool_result.tool_id
                                            ));
                                        }
                                    }
                                }
                                if summary_parts.is_empty() {
                                    "Task completed successfully.".to_string()
                                } else {
                                    summary_parts.join("\n\n")
                                }
                            } else {
                                "Task completed successfully.".to_string()
                            }
                        } else {
                            "Task completed successfully.".to_string()
                        }
                        // MutexGuard dropped here — safe to remove agent below
                    };
                    result = OrchestratorResult {
                        success: true,
                        summary,
                    };
                    break 'poll;
                }
                if status.status == AgentState::Failed {
                    result = OrchestratorResult {
                        success: false,
                        summary: format!("Task failed: {}", status.error.unwrap_or_default()),
                    };
                    break 'poll;
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        // Always remove the agent from the pool so the capacity slot is freed,
        // regardless of whether it completed, failed, or timed out.
        self.agents.lock().await.remove(&agent_id);

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resource_lock_file() {
        let resource_lock = ResourceLock::new();
        let path = PathBuf::from("/test/file.txt");

        let _guard1 = resource_lock.try_acquire_file(&path).unwrap();
        assert!(resource_lock.is_file_locked(&path));

        assert!(resource_lock.try_acquire_file(&path).is_err());

        drop(_guard1);
        assert!(!resource_lock.is_file_locked(&path));
    }

    #[test]
    fn test_resource_lock_ui_element() {
        let resource_lock = ResourceLock::new();
        let selector = "#submit-button";

        let _guard1 = resource_lock.try_acquire_ui_element(selector).unwrap();
        assert!(resource_lock.is_ui_element_locked(selector));

        assert!(resource_lock.try_acquire_ui_element(selector).is_err());

        drop(_guard1);
        assert!(!resource_lock.is_ui_element_locked(selector));
    }
}
