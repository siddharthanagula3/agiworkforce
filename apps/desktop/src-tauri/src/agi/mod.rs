pub mod api_tools_impl;
pub mod audio_processing;
pub mod comparator;
pub mod context_manager;
pub mod core;
pub mod executor;
pub mod knowledge;
pub mod learning;
pub mod memory;
pub mod planner;
pub mod resources;
pub mod sandbox;
pub mod tools;

#[cfg(test)]
mod tests;

pub use comparator::{ExecutionResult, ResultComparator, ScoredResult};
pub use context_manager::{CompactionResult, CompactionStats, ContextManager};
pub use core::AGICore;
pub use executor::AGIExecutor;
pub use knowledge::KnowledgeBase;
pub use learning::LearningSystem;
pub use memory::AGIMemory;
pub use planner::AGIPlanner;
pub use resources::ResourceManager;
pub use sandbox::{Sandbox, SandboxManager};
pub use tools::{Tool, ToolCapability, ToolRegistry, ToolResult};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// AGI Configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AGIConfig {
    /// Maximum concurrent tool executions
    pub max_concurrent_tools: usize,
    /// Memory limit for knowledge base (MB)
    pub knowledge_memory_mb: u64,
    /// Enable learning from experience
    pub enable_learning: bool,
    /// Enable self-improvement
    pub enable_self_improvement: bool,
    /// Resource limits
    pub resource_limits: ResourceLimits,
    /// Planning depth limit
    pub max_planning_depth: usize,
    /// Enable multi-modal processing
    pub enable_multimodal: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    pub cpu_percent: f64,
    pub memory_mb: u64,
    pub network_mbps: f64,
    pub storage_mb: u64,
}

impl Default for AGIConfig {
    fn default() -> Self {
        Self {
            max_concurrent_tools: 10,
            knowledge_memory_mb: 1024,
            enable_learning: true,
            enable_self_improvement: true,
            resource_limits: ResourceLimits {
                cpu_percent: 80.0,
                memory_mb: 2048,
                network_mbps: 100.0,
                storage_mb: 10240,
            },
            max_planning_depth: 20,
            enable_multimodal: true,
        }
    }
}

/// AGI Goal - what the AGI is trying to achieve
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Goal {
    pub id: String,
    pub description: String,
    pub priority: Priority,
    pub deadline: Option<u64>, // Unix timestamp
    pub constraints: Vec<Constraint>,
    pub success_criteria: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum Priority {
    Low = 1,
    Medium = 2,
    High = 3,
    Critical = 4,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Constraint {
    pub name: String,
    pub value: ConstraintValue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConstraintValue {
    ResourceLimit { resource: String, limit: f64 },
    TimeLimit { seconds: u64 },
    QualityThreshold { metric: String, threshold: f64 },
    Custom { key: String, value: String },
}

/// Execution Context - current state and environment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionContext {
    pub goal: Goal,
    pub current_state: HashMap<String, serde_json::Value>,
    pub available_resources: ResourceState,
    pub tool_results: Vec<ToolExecutionResult>,
    pub context_memory: Vec<ContextEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceState {
    pub cpu_usage_percent: f64,
    pub memory_usage_mb: u64,
    pub network_usage_mbps: f64,
    pub storage_usage_mb: u64,
    pub available_tools: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecutionResult {
    pub tool_id: String,
    pub success: bool,
    pub result: serde_json::Value,
    pub error: Option<String>,
    pub execution_time_ms: u64,
    pub resources_used: ResourceUsage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceUsage {
    pub cpu_percent: f64,
    pub memory_mb: u64,
    pub network_mb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextEntry {
    pub timestamp: u64,
    pub event: String,
    pub data: serde_json::Value,
}

/// AGI Capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AGICapabilities {
    pub can_read_files: bool,
    pub can_write_files: bool,
    pub can_execute_code: bool,
    pub can_automate_ui: bool,
    pub can_use_browser: bool,
    pub can_access_databases: bool,
    pub can_make_api_calls: bool,
    pub can_process_images: bool,
    pub can_process_audio: bool,
    pub can_understand_code: bool,
    pub can_learn_from_experience: bool,
    pub can_plan_complex_tasks: bool,
    pub can_adapt_strategies: bool,
}

impl Default for AGICapabilities {
    fn default() -> Self {
        Self {
            can_read_files: true,
            can_write_files: true,
            can_execute_code: true,
            can_automate_ui: true,
            can_use_browser: true,
            can_access_databases: true,
            can_make_api_calls: true,
            can_process_images: true,
            can_process_audio: true, // Basic audio processing capability available
            can_understand_code: true,
            can_learn_from_experience: true,
            can_plan_complex_tasks: true,
            can_adapt_strategies: true,
        }
    }
}
