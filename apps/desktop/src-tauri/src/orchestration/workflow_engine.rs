use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use uuid::Uuid;

/// Workflow definition containing all workflow metadata and structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDefinition {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub nodes: Vec<WorkflowNode>,
    pub edges: Vec<WorkflowEdge>,
    pub triggers: Vec<WorkflowTrigger>,
    pub metadata: HashMap<String, Value>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Types of nodes in a workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WorkflowNode {
    #[serde(rename = "agent")]
    AgentNode {
        id: String,
        position: NodePosition,
        data: AgentNodeData,
    },
    #[serde(rename = "decision")]
    DecisionNode {
        id: String,
        position: NodePosition,
        data: DecisionNodeData,
    },
    #[serde(rename = "loop")]
    LoopNode {
        id: String,
        position: NodePosition,
        data: LoopNodeData,
    },
    #[serde(rename = "parallel")]
    ParallelNode {
        id: String,
        position: NodePosition,
        data: ParallelNodeData,
    },
    #[serde(rename = "wait")]
    WaitNode {
        id: String,
        position: NodePosition,
        data: WaitNodeData,
    },
    #[serde(rename = "script")]
    ScriptNode {
        id: String,
        position: NodePosition,
        data: ScriptNodeData,
    },
    #[serde(rename = "tool")]
    ToolNode {
        id: String,
        position: NodePosition,
        data: ToolNodeData,
    },
}

impl WorkflowNode {
    pub fn id(&self) -> &str {
        match self {
            WorkflowNode::AgentNode { id, .. } => id,
            WorkflowNode::DecisionNode { id, .. } => id,
            WorkflowNode::LoopNode { id, .. } => id,
            WorkflowNode::ParallelNode { id, .. } => id,
            WorkflowNode::WaitNode { id, .. } => id,
            WorkflowNode::ScriptNode { id, .. } => id,
            WorkflowNode::ToolNode { id, .. } => id,
        }
    }

    pub fn position(&self) -> &NodePosition {
        match self {
            WorkflowNode::AgentNode { position, .. } => position,
            WorkflowNode::DecisionNode { position, .. } => position,
            WorkflowNode::LoopNode { position, .. } => position,
            WorkflowNode::ParallelNode { position, .. } => position,
            WorkflowNode::WaitNode { position, .. } => position,
            WorkflowNode::ScriptNode { position, .. } => position,
            WorkflowNode::ToolNode { position, .. } => position,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentNodeData {
    pub label: String,
    pub agent_template_id: Option<String>,
    pub agent_name: Option<String>,
    pub input_mapping: HashMap<String, String>,
    pub output_mapping: HashMap<String, String>,
    pub config: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionNodeData {
    pub label: String,
    pub condition: String,
    pub condition_type: ConditionType,
    pub true_path: Option<String>,
    pub false_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConditionType {
    Expression,
    OutputContains,
    OutputEquals,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopNodeData {
    pub label: String,
    pub loop_type: LoopType,
    pub iterations: Option<i32>,
    pub condition: Option<String>,
    pub collection: Option<String>,
    pub item_variable: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LoopType {
    Count,
    Condition,
    ForEach,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParallelNodeData {
    pub label: String,
    pub branches: Vec<String>,
    pub wait_for_all: bool,
    pub timeout_seconds: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaitNodeData {
    pub label: String,
    pub wait_type: WaitType,
    pub duration_seconds: Option<i32>,
    pub until_time: Option<i64>,
    pub condition: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WaitType {
    Duration,
    UntilTime,
    Condition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptNodeData {
    pub label: String,
    pub language: ScriptLanguage,
    pub code: String,
    pub timeout_seconds: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScriptLanguage {
    JavaScript,
    Python,
    Bash,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolNodeData {
    pub label: String,
    pub tool_name: String,
    pub tool_input: HashMap<String, Value>,
    pub timeout_seconds: Option<i32>,
}

/// Edge connecting two nodes in a workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub source_handle: Option<String>,
    pub target_handle: Option<String>,
    pub condition: Option<String>,
    pub label: Option<String>,
}

/// Trigger that starts workflow execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WorkflowTrigger {
    #[serde(rename = "manual")]
    Manual,
    #[serde(rename = "scheduled")]
    Scheduled {
        cron: String,
        timezone: Option<String>,
    },
    #[serde(rename = "event")]
    Event {
        event_type: String,
        filter: Option<HashMap<String, Value>>,
    },
    #[serde(rename = "webhook")]
    Webhook {
        url: String,
        method: String,
        auth_token: Option<String>,
    },
}

/// Workflow execution status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

impl std::fmt::Display for WorkflowStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkflowStatus::Pending => write!(f, "pending"),
            WorkflowStatus::Running => write!(f, "running"),
            WorkflowStatus::Paused => write!(f, "paused"),
            WorkflowStatus::Completed => write!(f, "completed"),
            WorkflowStatus::Failed => write!(f, "failed"),
            WorkflowStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// Workflow execution instance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowExecution {
    pub id: String,
    pub workflow_id: String,
    pub status: WorkflowStatus,
    pub current_node_id: Option<String>,
    pub inputs: HashMap<String, Value>,
    pub outputs: HashMap<String, Value>,
    pub error: Option<String>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}

/// Workflow execution log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowExecutionLog {
    pub id: String,
    pub execution_id: String,
    pub node_id: String,
    pub event_type: LogEventType,
    pub data: Option<Value>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogEventType {
    Started,
    Completed,
    Failed,
    Skipped,
}

impl std::fmt::Display for LogEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogEventType::Started => write!(f, "started"),
            LogEventType::Completed => write!(f, "completed"),
            LogEventType::Failed => write!(f, "failed"),
            LogEventType::Skipped => write!(f, "skipped"),
        }
    }
}

/// Workflow engine for managing workflow operations
pub struct WorkflowEngine {
    db_path: String,
}

impl WorkflowEngine {
    pub fn new(db_path: String) -> Self {
        Self { db_path }
    }

    fn get_connection(&self) -> Result<rusqlite::Connection, String> {
        rusqlite::Connection::open(&self.db_path)
            .map_err(|e| format!("Failed to open database: {}", e))
    }

    /// Create a new workflow
    pub fn create_workflow(&self, mut definition: WorkflowDefinition) -> Result<String, String> {
        let conn = self.get_connection()?;

        // Generate ID if not provided
        if definition.id.is_empty() {
            definition.id = Uuid::new_v4().to_string();
        }

        let now = Utc::now().timestamp();
        definition.created_at = now;
        definition.updated_at = now;

        let nodes_json = serde_json::to_string(&definition.nodes)
            .map_err(|e| format!("Failed to serialize nodes: {}", e))?;
        let edges_json = serde_json::to_string(&definition.edges)
            .map_err(|e| format!("Failed to serialize edges: {}", e))?;
        let triggers_json = serde_json::to_string(&definition.triggers)
            .map_err(|e| format!("Failed to serialize triggers: {}", e))?;
        let metadata_json = serde_json::to_string(&definition.metadata)
            .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

        conn.execute(
            "INSERT INTO workflow_definitions (id, user_id, name, description, nodes, edges, triggers, metadata, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                &definition.id,
                &definition.user_id,
                &definition.name,
                &definition.description,
                &nodes_json,
                &edges_json,
                &triggers_json,
                &metadata_json,
                definition.created_at,
                definition.updated_at,
            ],
        ).map_err(|e| format!("Failed to insert workflow: {}", e))?;

        Ok(definition.id)
    }

    /// Update an existing workflow
    pub fn update_workflow(
        &self,
        id: &str,
        mut definition: WorkflowDefinition,
    ) -> Result<(), String> {
        let conn = self.get_connection()?;

        definition.updated_at = Utc::now().timestamp();

        let nodes_json = serde_json::to_string(&definition.nodes)
            .map_err(|e| format!("Failed to serialize nodes: {}", e))?;
        let edges_json = serde_json::to_string(&definition.edges)
            .map_err(|e| format!("Failed to serialize edges: {}", e))?;
        let triggers_json = serde_json::to_string(&definition.triggers)
            .map_err(|e| format!("Failed to serialize triggers: {}", e))?;
        let metadata_json = serde_json::to_string(&definition.metadata)
            .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

        conn.execute(
            "UPDATE workflow_definitions
             SET name = ?1, description = ?2, nodes = ?3, edges = ?4, triggers = ?5, metadata = ?6, updated_at = ?7
             WHERE id = ?8",
            rusqlite::params![
                &definition.name,
                &definition.description,
                &nodes_json,
                &edges_json,
                &triggers_json,
                &metadata_json,
                definition.updated_at,
                id,
            ],
        ).map_err(|e| format!("Failed to update workflow: {}", e))?;

        Ok(())
    }

    /// Delete a workflow
    pub fn delete_workflow(&self, id: &str) -> Result<(), String> {
        let conn = self.get_connection()?;

        conn.execute(
            "DELETE FROM workflow_definitions WHERE id = ?1",
            rusqlite::params![id],
        )
        .map_err(|e| format!("Failed to delete workflow: {}", e))?;

        Ok(())
    }

    /// Get a workflow by ID
    pub fn get_workflow(&self, id: &str) -> Result<WorkflowDefinition, String> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            "SELECT id, user_id, name, description, nodes, edges, triggers, metadata, created_at, updated_at
             FROM workflow_definitions WHERE id = ?1"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let workflow = stmt
            .query_row(rusqlite::params![id], |row| {
                let nodes_json: String = row.get(4)?;
                let edges_json: String = row.get(5)?;
                let triggers_json: String = row.get(6)?;
                let metadata_json: String = row.get(7)?;

                let nodes: Vec<WorkflowNode> =
                    serde_json::from_str(&nodes_json).map_err(|e| rusqlite::Error::InvalidQuery)?;
                let edges: Vec<WorkflowEdge> =
                    serde_json::from_str(&edges_json).map_err(|e| rusqlite::Error::InvalidQuery)?;
                let triggers: Vec<WorkflowTrigger> = serde_json::from_str(&triggers_json)
                    .map_err(|e| rusqlite::Error::InvalidQuery)?;
                let metadata: HashMap<String, Value> = serde_json::from_str(&metadata_json)
                    .map_err(|e| rusqlite::Error::InvalidQuery)?;

                Ok(WorkflowDefinition {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    name: row.get(2)?,
                    description: row.get(3)?,
                    nodes,
                    edges,
                    triggers,
                    metadata,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|e| format!("Failed to query workflow: {}", e))?;

        Ok(workflow)
    }

    /// Get all workflows for a user
    pub fn get_user_workflows(&self, user_id: &str) -> Result<Vec<WorkflowDefinition>, String> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            "SELECT id, user_id, name, description, nodes, edges, triggers, metadata, created_at, updated_at
             FROM workflow_definitions WHERE user_id = ?1 ORDER BY updated_at DESC"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let workflows = stmt
            .query_map(rusqlite::params![user_id], |row| {
                let nodes_json: String = row.get(4)?;
                let edges_json: String = row.get(5)?;
                let triggers_json: String = row.get(6)?;
                let metadata_json: String = row.get(7)?;

                let nodes: Vec<WorkflowNode> =
                    serde_json::from_str(&nodes_json).map_err(|_| rusqlite::Error::InvalidQuery)?;
                let edges: Vec<WorkflowEdge> =
                    serde_json::from_str(&edges_json).map_err(|_| rusqlite::Error::InvalidQuery)?;
                let triggers: Vec<WorkflowTrigger> = serde_json::from_str(&triggers_json)
                    .map_err(|_| rusqlite::Error::InvalidQuery)?;
                let metadata: HashMap<String, Value> = serde_json::from_str(&metadata_json)
                    .map_err(|_| rusqlite::Error::InvalidQuery)?;

                Ok(WorkflowDefinition {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    name: row.get(2)?,
                    description: row.get(3)?,
                    nodes,
                    edges,
                    triggers,
                    metadata,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|e| format!("Failed to query workflows: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect workflows: {}", e))?;

        Ok(workflows)
    }

    /// Create a workflow execution
    pub fn create_execution(
        &self,
        workflow_id: &str,
        inputs: HashMap<String, Value>,
    ) -> Result<String, String> {
        let conn = self.get_connection()?;

        let execution_id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();

        let inputs_json = serde_json::to_string(&inputs)
            .map_err(|e| format!("Failed to serialize inputs: {}", e))?;
        let outputs_json = serde_json::to_string(&HashMap::<String, Value>::new())
            .map_err(|e| format!("Failed to serialize outputs: {}", e))?;

        conn.execute(
            "INSERT INTO workflow_executions (id, workflow_id, status, current_node_id, inputs, outputs, error, started_at, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                &execution_id,
                workflow_id,
                WorkflowStatus::Pending.to_string(),
                None::<String>,
                &inputs_json,
                &outputs_json,
                None::<String>,
                Some(now),
                None::<i64>,
            ],
        ).map_err(|e| format!("Failed to create execution: {}", e))?;

        Ok(execution_id)
    }

    /// Update execution status
    pub fn update_execution_status(
        &self,
        execution_id: &str,
        status: WorkflowStatus,
        current_node_id: Option<String>,
        error: Option<String>,
    ) -> Result<(), String> {
        let conn = self.get_connection()?;

        let completed_at = if status == WorkflowStatus::Completed
            || status == WorkflowStatus::Failed
            || status == WorkflowStatus::Cancelled
        {
            Some(Utc::now().timestamp())
        } else {
            None
        };

        conn.execute(
            "UPDATE workflow_executions
             SET status = ?1, current_node_id = ?2, error = ?3, completed_at = ?4
             WHERE id = ?5",
            rusqlite::params![
                status.to_string(),
                current_node_id,
                error,
                completed_at,
                execution_id,
            ],
        )
        .map_err(|e| format!("Failed to update execution: {}", e))?;

        Ok(())
    }

    /// Get execution status
    pub fn get_execution_status(&self, execution_id: &str) -> Result<WorkflowExecution, String> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            "SELECT id, workflow_id, status, current_node_id, inputs, outputs, error, started_at, completed_at
             FROM workflow_executions WHERE id = ?1"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let execution = stmt
            .query_row(rusqlite::params![execution_id], |row| {
                let status_str: String = row.get(2)?;
                let status = match status_str.as_str() {
                    "pending" => WorkflowStatus::Pending,
                    "running" => WorkflowStatus::Running,
                    "paused" => WorkflowStatus::Paused,
                    "completed" => WorkflowStatus::Completed,
                    "failed" => WorkflowStatus::Failed,
                    "cancelled" => WorkflowStatus::Cancelled,
                    _ => WorkflowStatus::Pending,
                };

                let inputs_json: String = row.get(4)?;
                let outputs_json: String = row.get(5)?;

                let inputs: HashMap<String, Value> = serde_json::from_str(&inputs_json)
                    .map_err(|_| rusqlite::Error::InvalidQuery)?;
                let outputs: HashMap<String, Value> = serde_json::from_str(&outputs_json)
                    .map_err(|_| rusqlite::Error::InvalidQuery)?;

                Ok(WorkflowExecution {
                    id: row.get(0)?,
                    workflow_id: row.get(1)?,
                    status,
                    current_node_id: row.get(3)?,
                    inputs,
                    outputs,
                    error: row.get(6)?,
                    started_at: row.get(7)?,
                    completed_at: row.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query execution: {}", e))?;

        Ok(execution)
    }

    /// Add execution log entry
    pub fn add_execution_log(
        &self,
        execution_id: &str,
        node_id: &str,
        event_type: LogEventType,
        data: Option<Value>,
    ) -> Result<String, String> {
        let conn = self.get_connection()?;

        let log_id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();

        let data_json = if let Some(d) = data {
            serde_json::to_string(&d).map_err(|e| format!("Failed to serialize data: {}", e))?
        } else {
            "null".to_string()
        };

        conn.execute(
            "INSERT INTO workflow_execution_logs (id, execution_id, node_id, event_type, data, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                &log_id,
                execution_id,
                node_id,
                event_type.to_string(),
                &data_json,
                now,
            ],
        ).map_err(|e| format!("Failed to add execution log: {}", e))?;

        Ok(log_id)
    }

    /// Get execution logs
    pub fn get_execution_logs(
        &self,
        execution_id: &str,
    ) -> Result<Vec<WorkflowExecutionLog>, String> {
        let conn = self.get_connection()?;

        let mut stmt = conn
            .prepare(
                "SELECT id, execution_id, node_id, event_type, data, timestamp
             FROM workflow_execution_logs WHERE execution_id = ?1 ORDER BY timestamp ASC",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let logs = stmt
            .query_map(rusqlite::params![execution_id], |row| {
                let event_type_str: String = row.get(3)?;
                let event_type = match event_type_str.as_str() {
                    "started" => LogEventType::Started,
                    "completed" => LogEventType::Completed,
                    "failed" => LogEventType::Failed,
                    "skipped" => LogEventType::Skipped,
                    _ => LogEventType::Started,
                };

                let data_json: String = row.get(4)?;
                let data: Option<Value> = serde_json::from_str(&data_json).ok();

                Ok(WorkflowExecutionLog {
                    id: row.get(0)?,
                    execution_id: row.get(1)?,
                    node_id: row.get(2)?,
                    event_type,
                    data,
                    timestamp: row.get(5)?,
                })
            })
            .map_err(|e| format!("Failed to query logs: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect logs: {}", e))?;

        Ok(logs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workflow_node_id() {
        let node = WorkflowNode::AgentNode {
            id: "test-id".to_string(),
            position: NodePosition { x: 0.0, y: 0.0 },
            data: AgentNodeData {
                label: "Test".to_string(),
                agent_template_id: None,
                agent_name: None,
                input_mapping: HashMap::new(),
                output_mapping: HashMap::new(),
                config: HashMap::new(),
            },
        };
        assert_eq!(node.id(), "test-id");
    }

    #[test]
    fn test_workflow_status_display() {
        assert_eq!(WorkflowStatus::Running.to_string(), "running");
        assert_eq!(WorkflowStatus::Completed.to_string(), "completed");
    }
}
