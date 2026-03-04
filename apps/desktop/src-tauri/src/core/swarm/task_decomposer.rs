//! Task Decomposition for Parallel Execution
//!
//! This module breaks complex tasks into parallelizable subtasks following
//! Kimi K2.5's approach of dynamic task decomposition based on requirements.

use super::{constants, SubtaskPriority, SubtaskStatus, SwarmError, SwarmResultType};
use crate::core::agi::{Goal, Priority};
use crate::core::llm::LLMRouter;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
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

    /// Gets the critical path (longest chain of dependencies) using
    /// topological-order dynamic programming. This is O(V+E) and correctly
    /// handles all DAG structures without the exponential worst-case of
    /// the previous recursive DFS approach.
    pub fn get_critical_path(&self) -> Vec<String> {
        if self.subtasks.is_empty() {
            return Vec::new();
        }

        // Step 1: Compute in-degree for each node (using forward edges: dependents map)
        let mut in_degree: HashMap<String, usize> = HashMap::new();
        for id in self.subtasks.keys() {
            in_degree.entry(id.clone()).or_insert(0);
        }
        for deps in self.dependents.values() {
            for dep in deps {
                if self.subtasks.contains_key(dep) {
                    *in_degree.entry(dep.clone()).or_insert(0) += 1;
                }
            }
        }

        // Step 2: Kahn's algorithm to compute topological order
        let mut queue: std::collections::VecDeque<String> = std::collections::VecDeque::new();
        for (id, &deg) in &in_degree {
            if deg == 0 {
                queue.push_back(id.clone());
            }
        }

        let mut topo_order = Vec::with_capacity(self.subtasks.len());
        while let Some(node) = queue.pop_front() {
            topo_order.push(node.clone());
            if let Some(dependents) = self.dependents.get(&node) {
                for dep in dependents {
                    if let Some(deg) = in_degree.get_mut(dep) {
                        *deg -= 1;
                        if *deg == 0 {
                            queue.push_back(dep.clone());
                        }
                    }
                }
            }
        }

        // Step 3: DP in topological order to find longest path
        // dist[node] = length of longest path ending at node
        let mut dist: HashMap<String, usize> = HashMap::new();
        // predecessor[node] = previous node on the longest path
        let mut predecessor: HashMap<String, Option<String>> = HashMap::new();

        for node in &topo_order {
            dist.insert(node.clone(), 1); // Each node counts as 1
            predecessor.insert(node.clone(), None);
        }

        for node in &topo_order {
            let current_dist = dist[node];
            if let Some(dependents) = self.dependents.get(node) {
                for dep in dependents {
                    if let Some(dep_dist) = dist.get_mut(dep) {
                        if current_dist + 1 > *dep_dist {
                            *dep_dist = current_dist + 1;
                            predecessor.insert(dep.clone(), Some(node.clone()));
                        }
                    }
                }
            }
        }

        // Step 4: Find the node with maximum distance and reconstruct the path
        let end_node = dist
            .iter()
            .max_by_key(|(_, &d)| d)
            .map(|(id, _)| id.clone());

        match end_node {
            Some(mut current) => {
                let mut path = Vec::new();
                loop {
                    path.push(current.clone());
                    match predecessor.get(&current) {
                        Some(Some(prev)) => current = prev.clone(),
                        _ => break,
                    }
                }
                path.reverse();
                path
            }
            None => Vec::new(),
        }
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
            // Trim path to only include the actual cycle, not ancestor nodes
            let cycle_start = path.iter().position(|n| n == id).unwrap_or(0);
            path.drain(0..cycle_start);
            path.push(id.to_string()); // close the cycle
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
        let pending = total.saturating_sub(completed + running + failed);

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

/// A cached decomposition result with an expiration timestamp.
#[derive(Debug, Clone)]
struct DecompositionCacheEntry {
    /// The cached subtasks from a previous decomposition.
    subtasks: Vec<Subtask>,
    /// When this cache entry was created.
    created_at: Instant,
}

impl DecompositionCacheEntry {
    /// Creates a new cache entry with the current timestamp.
    fn new(subtasks: Vec<Subtask>) -> Self {
        Self {
            subtasks,
            created_at: Instant::now(),
        }
    }

    /// Returns true if this cache entry has expired.
    fn is_expired(&self) -> bool {
        self.created_at.elapsed() > constants::DECOMPOSITION_CACHE_TTL
    }
}

/// Composite cache key combining task ID and a SHA-256 hash of the input content.
/// This ensures that identical decomposition requests are deduplicated even across
/// retries, while different tasks or changed inputs produce distinct keys.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct DecompositionCacheKey {
    task_id: String,
    input_content_hash: String,
}

impl DecompositionCacheKey {
    /// Builds a cache key from a goal by hashing its description, priority,
    /// constraints, and success criteria.
    fn from_goal(goal: &Goal) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(goal.description.as_bytes());
        hasher.update(format!("{:?}", goal.priority).as_bytes());
        for constraint in &goal.constraints {
            // Constraint is a struct with name + value, use Debug repr for hashing
            hasher.update(format!("{:?}", constraint).as_bytes());
        }
        for criterion in &goal.success_criteria {
            hasher.update(criterion.as_bytes());
        }
        let hash_bytes = hasher.finalize();
        Self {
            task_id: goal.id.clone(),
            input_content_hash: format!("{:x}", hash_bytes),
        }
    }
}

/// Task decomposer that breaks goals into parallelizable subtasks.
///
/// Includes an in-memory decomposition cache to guarantee idempotency:
/// if the same task is decomposed again (e.g. after a retry), the cached
/// result is returned without making a duplicate LLM call.
pub struct TaskDecomposer {
    router: Arc<RwLock<LLMRouter>>,
    #[allow(dead_code)]
    max_depth: usize,
    #[allow(dead_code)]
    min_subtask_size: usize,
    /// Thread-safe decomposition cache keyed on (task_id, input_content_hash).
    /// Protected by a tokio Mutex to allow safe concurrent access from multiple
    /// swarm executions without blocking the async runtime.
    decomposition_cache:
        Arc<tokio::sync::Mutex<HashMap<DecompositionCacheKey, DecompositionCacheEntry>>>,
}

impl TaskDecomposer {
    /// Creates a new task decomposer.
    pub fn new(router: Arc<RwLock<LLMRouter>>) -> Self {
        Self {
            router,
            max_depth: constants::MAX_DECOMPOSITION_DEPTH,
            min_subtask_size: 1,
            decomposition_cache: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        }
    }

    /// Decomposes a goal into parallelizable subtasks.
    ///
    /// This method is **idempotent**: if the same goal (by ID and content hash)
    /// has already been decomposed, the cached result is returned immediately
    /// without making another LLM call. This prevents duplicate LLM costs when
    /// decomposition is retried after a transient failure.
    pub async fn decompose(&self, goal: &Goal) -> SwarmResultType<DependencyGraph> {
        tracing::info!("[TaskDecomposer] Decomposing goal: {}", goal.description);

        let cache_key = DecompositionCacheKey::from_goal(goal);

        // Check cache first -- return cached subtasks if available and not expired
        {
            let mut cache = self.decomposition_cache.lock().await;

            // Evict expired entries while we hold the lock
            cache.retain(|_k, v| !v.is_expired());

            if let Some(entry) = cache.get(&cache_key) {
                tracing::info!(
                    "[TaskDecomposer] Cache HIT for goal '{}' (task_id={}, hash={}). Skipping LLM call.",
                    goal.description,
                    cache_key.task_id,
                    &cache_key.input_content_hash[..16],
                );

                let mut graph = DependencyGraph::new();
                for subtask in &entry.subtasks {
                    graph.add_subtask(subtask.clone());
                }
                graph.validate()?;

                let stats = graph.stats();
                tracing::info!(
                    "[TaskDecomposer] Decomposition (cached): {} subtasks, critical path: {}, max parallelism: {}",
                    stats.total_subtasks,
                    stats.critical_path_length,
                    stats.max_parallelism
                );

                return Ok(graph);
            }
        }
        // Lock is released here before the LLM call

        tracing::debug!(
            "[TaskDecomposer] Cache MISS for goal '{}' (task_id={}, hash={}). Calling LLM.",
            goal.description,
            cache_key.task_id,
            &cache_key.input_content_hash[..16],
        );

        // Use LLM to analyze and decompose the task
        let subtasks = self.analyze_and_decompose(goal).await?;

        // Store the result in the cache before building the graph
        {
            let mut cache = self.decomposition_cache.lock().await;
            cache.insert(cache_key, DecompositionCacheEntry::new(subtasks.clone()));
        }

        let mut graph = DependencyGraph::new();
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

    /// Invalidates the cache entry for a specific goal. Call this when a task
    /// completes or is abandoned to free memory.
    pub async fn invalidate_cache(&self, goal: &Goal) {
        let cache_key = DecompositionCacheKey::from_goal(goal);
        let mut cache = self.decomposition_cache.lock().await;
        if cache.remove(&cache_key).is_some() {
            tracing::debug!(
                "[TaskDecomposer] Cache invalidated for goal '{}'",
                goal.description,
            );
        }
    }

    /// Clears all cached decomposition results.
    pub async fn clear_cache(&self) {
        let mut cache = self.decomposition_cache.lock().await;
        let count = cache.len();
        cache.clear();
        tracing::debug!("[TaskDecomposer] Cache cleared ({} entries removed)", count,);
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
            suggested_parallelism: 1,
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
