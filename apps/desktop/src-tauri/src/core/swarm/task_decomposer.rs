//! Task Decomposition for Parallel Execution
//!
//! This module breaks complex tasks into parallelizable subtasks following
//! Kimi K2.5's approach of dynamic task decomposition based on requirements.

use super::{constants, SubtaskPriority, SubtaskStatus, SwarmError, SwarmResultType};
use crate::core::agi::{Goal, Priority};
use crate::core::llm::LLMRouter;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

/// Type of subtask determining execution strategy.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubtaskType {
    /// File system operations (read, write, search).
    FileOperation,
    /// Code analysis or generation.
    CodeTask,
    /// Web/API requests.
    NetworkRequest,
    /// Data transformation or processing.
    DataProcessing,
    /// UI automation tasks.
    UiAutomation,
    /// Database operations.
    DatabaseQuery,
    /// Shell command execution.
    ShellCommand,
    /// Generic computation.
    Computation,
    /// Coordination/aggregation task.
    Coordination,
}

/// Hint about parallelization potential.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParallelizationHint {
    /// Can this subtask run in parallel with others?
    pub parallelizable: bool,
    /// Estimated duration in milliseconds.
    pub estimated_duration_ms: u64,
    /// Resource intensity (0.0 - 1.0).
    pub resource_intensity: f64,
    /// Does this subtask have side effects?
    pub has_side_effects: bool,
    /// Suggested number of parallel instances.
    pub suggested_parallelism: usize,
}

impl Default for ParallelizationHint {
    fn default() -> Self {
        Self {
            parallelizable: true,
            estimated_duration_ms: 1000,
            resource_intensity: 0.5,
            has_side_effects: false,
            suggested_parallelism: 1,
        }
    }
}

/// A subtask produced by decomposition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subtask {
    /// Unique identifier for this subtask.
    pub id: String,
    /// Human-readable description.
    pub description: String,
    /// The type of subtask.
    pub task_type: SubtaskType,
    /// Priority for scheduling.
    pub priority: SubtaskPriority,
    /// Current execution status.
    pub status: SubtaskStatus,
    /// IDs of subtasks this depends on.
    pub dependencies: Vec<String>,
    /// Parameters/input for the subtask.
    pub parameters: serde_json::Value,
    /// Hints for parallel execution.
    pub parallelization: ParallelizationHint,
    /// Maximum allowed execution time.
    pub timeout: Duration,
    /// Number of retry attempts remaining.
    pub retries_remaining: u32,
    /// Parent goal ID.
    pub goal_id: String,
    /// Depth in decomposition tree.
    pub depth: usize,
}

impl Subtask {
    /// Creates a new subtask with default values.
    pub fn new(
        id: impl Into<String>,
        description: impl Into<String>,
        task_type: SubtaskType,
        goal_id: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            description: description.into(),
            task_type,
            priority: SubtaskPriority::Normal,
            status: SubtaskStatus::Pending,
            dependencies: Vec::new(),
            parameters: serde_json::Value::Null,
            parallelization: ParallelizationHint::default(),
            timeout: constants::DEFAULT_SUBTASK_TIMEOUT,
            retries_remaining: constants::MAX_SUBTASK_RETRIES,
            goal_id: goal_id.into(),
            depth: 0,
        }
    }

    /// Checks if this subtask is ready to execute (all dependencies met).
    pub fn is_ready(&self, completed: &HashSet<String>) -> bool {
        self.status == SubtaskStatus::Pending
            && self.dependencies.iter().all(|dep| completed.contains(dep))
    }

    /// Marks the subtask as running.
    pub fn start(&mut self) {
        self.status = SubtaskStatus::Running;
    }

    /// Marks the subtask as completed.
    pub fn complete(&mut self) {
        self.status = SubtaskStatus::Completed;
    }

    /// Marks the subtask as failed.
    pub fn fail(&mut self) -> bool {
        if self.retries_remaining > 0 {
            self.retries_remaining -= 1;
            self.status = SubtaskStatus::Pending;
            true // Will retry
        } else {
            self.status = SubtaskStatus::Failed;
            false // No more retries
        }
    }
}

/// Dependency graph for subtask scheduling.
#[derive(Debug, Clone, Default)]
pub struct DependencyGraph {
    /// All subtasks indexed by ID.
    pub subtasks: HashMap<String, Subtask>,
    /// Forward dependencies (subtask -> depends on).
    dependencies: HashMap<String, HashSet<String>>,
    /// Reverse dependencies (subtask -> depended on by).
    dependents: HashMap<String, HashSet<String>>,
    /// Completed subtask IDs.
    completed: HashSet<String>,
    /// Currently running subtask IDs.
    running: HashSet<String>,
}

impl DependencyGraph {
    /// Creates a new empty dependency graph.
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds a subtask to the graph.
    pub fn add_subtask(&mut self, subtask: Subtask) {
        let id = subtask.id.clone();

        // Add forward dependencies
        for dep in &subtask.dependencies {
            self.dependencies
                .entry(id.clone())
                .or_default()
                .insert(dep.clone());

            // Add reverse dependency
            self.dependents
                .entry(dep.clone())
                .or_default()
                .insert(id.clone());
        }

        self.subtasks.insert(id, subtask);
    }

    /// Gets all subtasks ready for execution.
    pub fn get_ready_subtasks(&self) -> Vec<&Subtask> {
        self.subtasks
            .values()
            .filter(|s| s.is_ready(&self.completed) && !self.running.contains(&s.id))
            .collect()
    }

    /// Marks a subtask as started.
    pub fn mark_running(&mut self, id: &str) {
        self.running.insert(id.to_string());
        if let Some(subtask) = self.subtasks.get_mut(id) {
            subtask.start();
        }
    }

    /// Marks a subtask as completed and returns newly unblocked subtasks.
    pub fn mark_completed(&mut self, id: &str) -> Vec<String> {
        self.running.remove(id);
        self.completed.insert(id.to_string());

        if let Some(subtask) = self.subtasks.get_mut(id) {
            subtask.complete();
        }

        // Find newly unblocked subtasks
        let mut unblocked = Vec::new();
        if let Some(dependents) = self.dependents.get(id) {
            for dependent_id in dependents {
                if let Some(subtask) = self.subtasks.get(dependent_id) {
                    if subtask.is_ready(&self.completed) {
                        unblocked.push(dependent_id.clone());
                    }
                }
            }
        }

        unblocked
    }

    /// Marks a subtask as failed and returns whether it will be retried.
    pub fn mark_failed(&mut self, id: &str) -> bool {
        self.running.remove(id);
        if let Some(subtask) = self.subtasks.get_mut(id) {
            subtask.fail()
        } else {
            false
        }
    }

    /// Checks if all subtasks are complete or failed.
    pub fn is_complete(&self) -> bool {
        self.subtasks
            .values()
            .all(|s| s.status == SubtaskStatus::Completed || s.status == SubtaskStatus::Failed)
    }

    /// Gets the critical path (longest chain of dependencies).
    pub fn get_critical_path(&self) -> Vec<String> {
        let mut longest_path = Vec::new();
        let mut visited = HashSet::new();

        // Find all root subtasks (no dependencies)
        let roots: Vec<_> = self
            .subtasks
            .values()
            .filter(|s| s.dependencies.is_empty())
            .map(|s| s.id.clone())
            .collect();

        for root in roots {
            let path = self.dfs_longest_path(&root, &mut visited);
            if path.len() > longest_path.len() {
                longest_path = path;
            }
        }

        longest_path
    }

    fn dfs_longest_path(&self, id: &str, visited: &mut HashSet<String>) -> Vec<String> {
        if visited.contains(id) {
            return Vec::new();
        }
        visited.insert(id.to_string());

        let mut longest = Vec::new();

        if let Some(dependents) = self.dependents.get(id) {
            for dependent in dependents {
                let path = self.dfs_longest_path(dependent, visited);
                if path.len() > longest.len() {
                    longest = path;
                }
            }
        }

        visited.remove(id);
        let mut result = vec![id.to_string()];
        result.extend(longest);
        result
    }

    /// Validates the graph for cycles.
    pub fn validate(&self) -> SwarmResultType<()> {
        let mut visited = HashSet::new();
        let mut rec_stack = HashSet::new();
        let mut path = Vec::new();

        for id in self.subtasks.keys() {
            if self.has_cycle(id, &mut visited, &mut rec_stack, &mut path) {
                return Err(SwarmError::DependencyCycle {
                    cycle: path.join(" -> "),
                });
            }
        }

        Ok(())
    }

    fn has_cycle(
        &self,
        id: &str,
        visited: &mut HashSet<String>,
        rec_stack: &mut HashSet<String>,
        path: &mut Vec<String>,
    ) -> bool {
        if rec_stack.contains(id) {
            path.push(id.to_string());
            return true;
        }

        if visited.contains(id) {
            return false;
        }

        visited.insert(id.to_string());
        rec_stack.insert(id.to_string());
        path.push(id.to_string());

        if let Some(deps) = self.dependencies.get(id) {
            for dep in deps {
                if self.has_cycle(dep, visited, rec_stack, path) {
                    return true;
                }
            }
        }

        path.pop();
        rec_stack.remove(id);
        false
    }

    /// Calculates the theoretical minimum execution time (critical path duration).
    pub fn calculate_critical_path_duration(&self) -> u64 {
        let path = self.get_critical_path();
        path.iter()
            .filter_map(|id| self.subtasks.get(id))
            .map(|s| s.parallelization.estimated_duration_ms)
            .sum()
    }

    /// Gets statistics about the graph.
    pub fn stats(&self) -> GraphStats {
        let total = self.subtasks.len();
        let completed = self.completed.len();
        let running = self.running.len();
        let failed = self
            .subtasks
            .values()
            .filter(|s| s.status == SubtaskStatus::Failed)
            .count();
        let pending = total - completed - running - failed;

        GraphStats {
            total_subtasks: total,
            completed,
            running,
            failed,
            pending,
            critical_path_length: self.get_critical_path().len(),
            max_parallelism: self.get_ready_subtasks().len().max(running),
        }
    }
}

/// Statistics about the dependency graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphStats {
    pub total_subtasks: usize,
    pub completed: usize,
    pub running: usize,
    pub failed: usize,
    pub pending: usize,
    pub critical_path_length: usize,
    pub max_parallelism: usize,
}

/// Task decomposer that breaks goals into parallelizable subtasks.
pub struct TaskDecomposer {
    router: Arc<RwLock<LLMRouter>>,
    #[allow(dead_code)]
    max_depth: usize,
    #[allow(dead_code)]
    min_subtask_size: usize,
}

impl TaskDecomposer {
    /// Creates a new task decomposer.
    pub fn new(router: Arc<RwLock<LLMRouter>>) -> Self {
        Self {
            router,
            max_depth: constants::MAX_DECOMPOSITION_DEPTH,
            min_subtask_size: 1,
        }
    }

    /// Decomposes a goal into parallelizable subtasks.
    pub async fn decompose(&self, goal: &Goal) -> SwarmResultType<DependencyGraph> {
        tracing::info!("[TaskDecomposer] Decomposing goal: {}", goal.description);

        let mut graph = DependencyGraph::new();

        // Use LLM to analyze and decompose the task
        let subtasks = self.analyze_and_decompose(goal).await?;

        for subtask in subtasks {
            graph.add_subtask(subtask);
        }

        // Validate no cycles
        graph.validate()?;

        let stats = graph.stats();
        tracing::info!(
            "[TaskDecomposer] Decomposition complete: {} subtasks, critical path: {}, max parallelism: {}",
            stats.total_subtasks,
            stats.critical_path_length,
            stats.max_parallelism
        );

        Ok(graph)
    }

    async fn analyze_and_decompose(&self, goal: &Goal) -> SwarmResultType<Vec<Subtask>> {
        let prompt = self.build_decomposition_prompt(goal);

        let response = self
            .router
            .read()
            .await
            .send_message(&prompt, None)
            .await
            .map_err(|e| SwarmError::DecompositionFailed(e.to_string()))?;

        self.parse_decomposition_response(&response, goal)
    }

    fn build_decomposition_prompt(&self, goal: &Goal) -> String {
        format!(
            r#"You are AGI Workforce's task decomposition system. Analyze the user's goal and break it down into parallelizable subtasks that can be executed to complete their request.

GOAL: {}
PRIORITY: {:?}
CONSTRAINTS: {:?}
SUCCESS CRITERIA: {:?}

RULES:
1. Identify independent subtasks that can run in PARALLEL
2. Identify subtasks with DEPENDENCIES that must run sequentially
3. Each subtask should be atomic and self-contained
4. Minimize the critical path (longest chain of dependencies)
5. Tag each subtask with its type: file_operation, code_task, network_request, data_processing, ui_automation, database_query, shell_command, computation, coordination

OUTPUT FORMAT (JSON array):
[
  {{
    "id": "subtask_1",
    "description": "Clear description of what to do",
    "type": "file_operation|code_task|network_request|data_processing|ui_automation|database_query|shell_command|computation|coordination",
    "dependencies": [],
    "estimated_duration_ms": 1000,
    "parallelizable": true,
    "has_side_effects": false,
    "priority": "normal|low|high|critical"
  }},
  {{
    "id": "subtask_2",
    "description": "Another subtask",
    "type": "code_task",
    "dependencies": ["subtask_1"],
    "estimated_duration_ms": 2000,
    "parallelizable": true,
    "has_side_effects": true,
    "priority": "high"
  }}
]

Provide ONLY the JSON array, no other text."#,
            goal.description, goal.priority, goal.constraints, goal.success_criteria
        )
    }

    fn parse_decomposition_response(
        &self,
        response: &str,
        goal: &Goal,
    ) -> SwarmResultType<Vec<Subtask>> {
        // Try to extract JSON from response
        let json_str = if response.trim().starts_with('[') {
            response.trim().to_string()
        } else if let Some(start) = response.find('[') {
            if let Some(end) = response.rfind(']') {
                response[start..=end].to_string()
            } else {
                return Err(SwarmError::DecompositionFailed(
                    "Invalid JSON: no closing bracket".to_string(),
                ));
            }
        } else {
            // Fallback: create a single subtask for the entire goal
            return Ok(vec![self.create_fallback_subtask(goal)]);
        };

        let parsed: Vec<serde_json::Value> = serde_json::from_str(&json_str)
            .map_err(|e| SwarmError::DecompositionFailed(format!("JSON parse error: {}", e)))?;

        let mut subtasks = Vec::new();
        for (idx, item) in parsed.into_iter().enumerate() {
            let subtask = self.parse_subtask_item(item, goal, idx)?;
            subtasks.push(subtask);
        }

        if subtasks.is_empty() {
            subtasks.push(self.create_fallback_subtask(goal));
        }

        Ok(subtasks)
    }

    fn parse_subtask_item(
        &self,
        item: serde_json::Value,
        goal: &Goal,
        idx: usize,
    ) -> SwarmResultType<Subtask> {
        let id = item["id"]
            .as_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("subtask_{}", idx + 1));

        let description = item["description"]
            .as_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("Subtask {}", idx + 1));

        let task_type = self.parse_task_type(item["type"].as_str().unwrap_or("computation"));

        let dependencies: Vec<String> = item["dependencies"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        let estimated_duration_ms = item["estimated_duration_ms"].as_u64().unwrap_or(1000);
        let parallelizable = item["parallelizable"].as_bool().unwrap_or(true);
        let has_side_effects = item["has_side_effects"].as_bool().unwrap_or(false);

        let priority = match item["priority"].as_str().unwrap_or("normal") {
            "low" => SubtaskPriority::Low,
            "high" => SubtaskPriority::High,
            "critical" => SubtaskPriority::Critical,
            _ => SubtaskPriority::Normal,
        };

        let mut subtask = Subtask::new(id, description, task_type, goal.id.clone());
        subtask.dependencies = dependencies;
        subtask.priority = priority;
        subtask.parallelization = ParallelizationHint {
            parallelizable,
            estimated_duration_ms,
            resource_intensity: if has_side_effects { 0.7 } else { 0.3 },
            has_side_effects,
            suggested_parallelism: if parallelizable { 1 } else { 0 },
        };
        subtask.parameters = item
            .get("parameters")
            .cloned()
            .unwrap_or(serde_json::Value::Null);

        Ok(subtask)
    }

    fn parse_task_type(&self, type_str: &str) -> SubtaskType {
        match type_str.to_lowercase().as_str() {
            "file_operation" | "file" => SubtaskType::FileOperation,
            "code_task" | "code" => SubtaskType::CodeTask,
            "network_request" | "network" | "api" => SubtaskType::NetworkRequest,
            "data_processing" | "data" => SubtaskType::DataProcessing,
            "ui_automation" | "ui" => SubtaskType::UiAutomation,
            "database_query" | "database" | "db" => SubtaskType::DatabaseQuery,
            "shell_command" | "shell" | "command" => SubtaskType::ShellCommand,
            "coordination" | "aggregate" => SubtaskType::Coordination,
            _ => SubtaskType::Computation,
        }
    }

    fn create_fallback_subtask(&self, goal: &Goal) -> Subtask {
        let mut subtask = Subtask::new(
            format!("subtask_{}", uuid::Uuid::new_v4()),
            goal.description.clone(),
            SubtaskType::Computation,
            goal.id.clone(),
        );
        subtask.priority = match goal.priority {
            Priority::Low => SubtaskPriority::Low,
            Priority::Medium => SubtaskPriority::Normal,
            Priority::High => SubtaskPriority::High,
            Priority::Critical => SubtaskPriority::Critical,
        };
        subtask
    }

    /// Optimizes the dependency graph for minimum critical path.
    pub fn optimize_critical_path(&self, graph: &mut DependencyGraph) {
        // Find subtasks that could potentially run earlier
        let critical_path = graph.get_critical_path();
        if critical_path.len() <= 1 {
            return;
        }

        tracing::debug!(
            "[TaskDecomposer] Optimizing critical path of length {}",
            critical_path.len()
        );

        // Identify bottlenecks (subtasks with many dependents)
        let mut bottlenecks: Vec<(String, usize)> = graph
            .dependents
            .iter()
            .map(|(id, deps)| (id.clone(), deps.len()))
            .collect();
        bottlenecks.sort_by(|a, b| b.1.cmp(&a.1));

        // For top bottlenecks, increase priority
        for (id, _) in bottlenecks.into_iter().take(3) {
            if let Some(subtask) = graph.subtasks.get_mut(&id) {
                if subtask.priority < SubtaskPriority::High {
                    subtask.priority = SubtaskPriority::High;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dependency_graph_basic() {
        let mut graph = DependencyGraph::new();

        let s1 = Subtask::new("s1", "Task 1", SubtaskType::Computation, "goal_1");
        let mut s2 = Subtask::new("s2", "Task 2", SubtaskType::Computation, "goal_1");
        s2.dependencies = vec!["s1".to_string()];

        graph.add_subtask(s1);
        graph.add_subtask(s2);

        assert!(graph.validate().is_ok());

        let ready = graph.get_ready_subtasks();
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "s1");
    }

    #[test]
    fn test_dependency_graph_cycle_detection() {
        let mut graph = DependencyGraph::new();

        let mut s1 = Subtask::new("s1", "Task 1", SubtaskType::Computation, "goal_1");
        s1.dependencies = vec!["s2".to_string()];

        let mut s2 = Subtask::new("s2", "Task 2", SubtaskType::Computation, "goal_1");
        s2.dependencies = vec!["s1".to_string()];

        graph.add_subtask(s1);
        graph.add_subtask(s2);

        assert!(graph.validate().is_err());
    }

    #[test]
    fn test_subtask_ready_check() {
        let mut completed = HashSet::new();
        let mut subtask = Subtask::new("s1", "Task", SubtaskType::Computation, "goal");
        subtask.dependencies = vec!["s0".to_string()];

        assert!(!subtask.is_ready(&completed));

        completed.insert("s0".to_string());
        assert!(subtask.is_ready(&completed));
    }

    #[test]
    fn test_critical_path() {
        let mut graph = DependencyGraph::new();

        // Create a diamond dependency pattern:
        // s1 -> s2 -> s4
        // s1 -> s3 -> s4
        let s1 = Subtask::new("s1", "Start", SubtaskType::Computation, "goal");

        let mut s2 = Subtask::new("s2", "Path A", SubtaskType::Computation, "goal");
        s2.dependencies = vec!["s1".to_string()];

        let mut s3 = Subtask::new("s3", "Path B", SubtaskType::Computation, "goal");
        s3.dependencies = vec!["s1".to_string()];

        let mut s4 = Subtask::new("s4", "End", SubtaskType::Computation, "goal");
        s4.dependencies = vec!["s2".to_string(), "s3".to_string()];

        graph.add_subtask(s1);
        graph.add_subtask(s2);
        graph.add_subtask(s3);
        graph.add_subtask(s4);

        let path = graph.get_critical_path();
        assert_eq!(path.len(), 3); // s1 -> s2|s3 -> s4
    }
}
