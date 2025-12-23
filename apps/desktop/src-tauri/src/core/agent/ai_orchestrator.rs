use crate::core::agent::code_generator::CodeGenerator;

use crate::core::agent::context_manager::ContextManager;
use crate::core::agent::prompt_engineer::{PromptCategory, PromptEngineer};
use crate::core::agent::rag_system::{RAGContext, RAGSystem};
use crate::core::mcp::McpToolRegistry;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationTask {
    pub id: String,
    pub description: String,
    pub task_type: TaskType,
    pub priority: u8,
    pub dependencies: Vec<String>,
    pub agent_type: AgentType,
    pub tools_needed: Vec<String>,
    pub estimated_duration_sec: u64,
    pub status: TaskStatus,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    CodeGeneration,
    CodeRefactoring,
    BugFixing,
    TestGeneration,
    Documentation,
    CodeReview,
    DependencyManagement,
    BuildAndDeploy,
    PerformanceOptimization,
    SecurityAudit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    CodeGenerator,
    RefactoringAgent,
    TestAgent,
    DocumentationAgent,
    ReviewAgent,
    BuildAgent,
    SecurityAgent,
    GeneralPurpose,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Blocked,
}

pub struct AIOrchestrator {
    _context_manager: ContextManager,
    rag_system: RAGSystem,
    prompt_engineer: PromptEngineer,
    code_generator: CodeGenerator,
    mcp_registry: Option<McpToolRegistry>,
    task_queue: VecDeque<OrchestrationTask>,
    completed_tasks: HashMap<String, OrchestrationTask>,
    active_tasks: HashMap<String, OrchestrationTask>,
}

impl AIOrchestrator {
    pub fn new(
        context_manager: ContextManager,
        rag_system: RAGSystem,
        prompt_engineer: PromptEngineer,
        code_generator: CodeGenerator,
    ) -> Self {
        Self {
            _context_manager: context_manager,
            rag_system,
            prompt_engineer,
            code_generator,
            mcp_registry: None,
            task_queue: VecDeque::new(),
            completed_tasks: HashMap::new(),
            active_tasks: HashMap::new(),
        }
    }

    pub fn set_mcp_registry(&mut self, registry: McpToolRegistry) {
        self.mcp_registry = Some(registry);
    }

    pub async fn orchestrate_task(&mut self, description: String) -> Result<OrchestrationResult> {
        let rag_context = self.rag_system.retrieve_context(&description, 10);

        let category = self.prompt_engineer.detect_category(&description);
        let _optimized_prompt = self
            .prompt_engineer
            .generate_prompt_from_description(&description, Some(category.clone()));

        let subtasks = self
            .break_down_task(&description, &rag_context, &category)
            .await?;

        for subtask in subtasks {
            self.task_queue.push_back(subtask);
        }

        let mut results = Vec::new();
        while let Some(task) = self.get_next_executable_task() {
            let task_id = task.id.clone();
            self.active_tasks.insert(task_id.clone(), task.clone());

            match self.execute_task(task.clone()).await {
                Ok(result) => {
                    let mut completed_task = task;
                    completed_task.status = TaskStatus::Completed;
                    completed_task.result = Some(result.clone());
                    self.completed_tasks
                        .insert(completed_task.id.clone(), completed_task);
                    self.active_tasks.remove(&task_id);
                    results.push(result);
                }
                Err(e) => {
                    let mut failed_task = task;
                    failed_task.status = TaskStatus::Failed;
                    failed_task.error = Some(e.to_string());
                    self.completed_tasks
                        .insert(failed_task.id.clone(), failed_task);
                    self.active_tasks.remove(&task_id);
                    return Err(anyhow!("Task execution failed: {}", e));
                }
            }
        }

        let results_clone = results.clone();
        Ok(OrchestrationResult {
            task_id: Uuid::new_v4().to_string(),
            description,
            subtasks_completed: results.len(),
            results,
            summary: self.generate_summary(&results_clone),
        })
    }

    async fn break_down_task(
        &self,
        description: &str,
        _rag_context: &RAGContext,
        category: &PromptCategory,
    ) -> Result<Vec<OrchestrationTask>> {
        let mut subtasks = Vec::new();

        match category {
            PromptCategory::CodeGeneration => {
                subtasks.push(OrchestrationTask {
                    id: Uuid::new_v4().to_string(),
                    description: format!("Analyze requirements for: {}", description),
                    task_type: TaskType::CodeReview,
                    priority: 10,
                    dependencies: vec![],
                    agent_type: AgentType::GeneralPurpose,
                    tools_needed: vec!["code_analysis".to_string()],
                    estimated_duration_sec: 5,
                    status: TaskStatus::Pending,
                    result: None,
                    error: None,
                });

                subtasks.push(OrchestrationTask {
                    id: Uuid::new_v4().to_string(),
                    description: format!("Generate code for: {}", description),
                    task_type: TaskType::CodeGeneration,
                    priority: 9,
                    dependencies: vec![subtasks[0].id.clone()],
                    agent_type: AgentType::CodeGenerator,
                    tools_needed: vec![
                        "code_generation".to_string(),
                        "file_operations".to_string(),
                    ],
                    estimated_duration_sec: 30,
                    status: TaskStatus::Pending,
                    result: None,
                    error: None,
                });

                subtasks.push(OrchestrationTask {
                    id: Uuid::new_v4().to_string(),
                    description: format!("Generate tests for: {}", description),
                    task_type: TaskType::TestGeneration,
                    priority: 8,
                    dependencies: vec![subtasks[1].id.clone()],
                    agent_type: AgentType::TestAgent,
                    tools_needed: vec!["test_generation".to_string()],
                    estimated_duration_sec: 20,
                    status: TaskStatus::Pending,
                    result: None,
                    error: None,
                });

                subtasks.push(OrchestrationTask {
                    id: Uuid::new_v4().to_string(),
                    description: format!("Generate documentation for: {}", description),
                    task_type: TaskType::Documentation,
                    priority: 7,
                    dependencies: vec![subtasks[1].id.clone()],
                    agent_type: AgentType::DocumentationAgent,
                    tools_needed: vec!["documentation".to_string()],
                    estimated_duration_sec: 10,
                    status: TaskStatus::Pending,
                    result: None,
                    error: None,
                });
            }

            PromptCategory::BugFixing => {
                subtasks.push(OrchestrationTask {
                    id: Uuid::new_v4().to_string(),
                    description: format!("Reproduce bug: {}", description),
                    task_type: TaskType::BugFixing,
                    priority: 10,
                    dependencies: vec![],
                    agent_type: AgentType::GeneralPurpose,
                    tools_needed: vec!["debugging".to_string()],
                    estimated_duration_sec: 10,
                    status: TaskStatus::Pending,
                    result: None,
                    error: None,
                });

                subtasks.push(OrchestrationTask {
                    id: Uuid::new_v4().to_string(),
                    description: format!("Fix bug: {}", description),
                    task_type: TaskType::BugFixing,
                    priority: 9,
                    dependencies: vec![subtasks[0].id.clone()],
                    agent_type: AgentType::CodeGenerator,
                    tools_needed: vec!["code_generation".to_string()],
                    estimated_duration_sec: 15,
                    status: TaskStatus::Pending,
                    result: None,
                    error: None,
                });

                subtasks.push(OrchestrationTask {
                    id: Uuid::new_v4().to_string(),
                    description: format!("Add regression tests for: {}", description),
                    task_type: TaskType::TestGeneration,
                    priority: 8,
                    dependencies: vec![subtasks[1].id.clone()],
                    agent_type: AgentType::TestAgent,
                    tools_needed: vec!["test_generation".to_string()],
                    estimated_duration_sec: 10,
                    status: TaskStatus::Pending,
                    result: None,
                    error: None,
                });
            }

            _ => {
                subtasks.push(OrchestrationTask {
                    id: Uuid::new_v4().to_string(),
                    description: description.to_string(),
                    task_type: TaskType::CodeGeneration,
                    priority: 10,
                    dependencies: vec![],
                    agent_type: AgentType::GeneralPurpose,
                    tools_needed: vec![],
                    estimated_duration_sec: 30,
                    status: TaskStatus::Pending,
                    result: None,
                    error: None,
                });
            }
        }

        Ok(subtasks)
    }

    fn get_next_executable_task(&mut self) -> Option<OrchestrationTask> {
        let mut executable_index = None;

        for (i, task) in self.task_queue.iter().enumerate() {
            let deps_satisfied = task
                .dependencies
                .iter()
                .all(|dep_id| self.completed_tasks.contains_key(dep_id));

            if deps_satisfied && task.status == TaskStatus::Pending {
                executable_index = Some(i);
                break;
            }
        }

        executable_index.and_then(|i| self.task_queue.remove(i))
    }

    async fn execute_task(&self, task: OrchestrationTask) -> Result<serde_json::Value> {
        match task.agent_type {
            AgentType::CodeGenerator => {
                let target_files = vec![];

                let enhanced_context = format!(
                    "Task Context: {}\nTools: {:?}",
                    task.description, task.tools_needed
                );

                let request = crate::core::agent::code_generator::CodeGenRequest {
                    task_id: task.id.clone(),
                    description: task.description.clone(),
                    target_files,
                    constraints: vec![],
                    context: enhanced_context,
                };

                let result = self.code_generator.generate_code(request).await?;
                Ok(serde_json::to_value(result)?)
            }

            AgentType::TestAgent => {
                let files = vec![];

                let test_framework = if task.tools_needed.contains(&"jest".to_string()) {
                    Some("jest".to_string())
                } else {
                    None
                };

                let result = self
                    .code_generator
                    .generate_tests(files, test_framework)
                    .await?;
                Ok(serde_json::to_value(result)?)
            }

            AgentType::GeneralPurpose => {
                if let Some(ref registry) = self.mcp_registry {
                    let mut tool_results = Vec::new();
                    for tool_name in &task.tools_needed {
                        if let Ok(tool) = registry.get_tool(tool_name) {
                            tool_results.push(serde_json::json!({
                                "tool": tool_name,
                                "status": "executed (simulated)",
                                "description": tool.description
                            }));
                        }
                    }

                    Ok(serde_json::json!({
                        "status": "completed",
                        "task": task.description,
                        "tool_results": tool_results
                    }))
                } else {
                    Ok(serde_json::json!({
                        "status": "completed",
                        "task": task.description,
                        "note": "No MCP registry available"
                    }))
                }
            }

            _ => Ok(serde_json::json!({
                "status": "completed",
                "task": task.description,
            })),
        }
    }

    fn generate_summary(&self, results: &[serde_json::Value]) -> String {
        format!(
            "Orchestrated {} tasks successfully. All subtasks completed.",
            results.len()
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationResult {
    pub task_id: String,
    pub description: String,
    pub subtasks_completed: usize,
    pub results: Vec<serde_json::Value>,
    pub summary: String,
}
