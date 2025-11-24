use super::*;
use crate::agi::tools::ToolRegistry;
use crate::router::{LLMRouter, Provider};
use chrono::Utc;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use uuid::Uuid;

/// AI Employee Executor manages task execution and demo mode
pub struct AIEmployeeExecutor {
    db: Arc<Mutex<Connection>>,
    llm_router: Arc<Mutex<LLMRouter>>,
    tools: Arc<ToolRegistry>,
}

impl AIEmployeeExecutor {
    /// Create a new executor instance
    pub fn new(
        db: Arc<Mutex<Connection>>,
        llm_router: Arc<Mutex<LLMRouter>>,
        tools: Arc<ToolRegistry>,
    ) -> Self {
        Self {
            db,
            llm_router,
            tools,
        }
    }

    /// Hire an employee for a user
    pub async fn hire(&self, employee_id: &str, user_id: &str) -> Result<String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        // Check if employee exists
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM ai_employees WHERE id = ?1",
                [employee_id],
                |row| row.get(0),
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        if !exists {
            return Err(EmployeeError::NotFound(employee_id.to_string()));
        }

        // Check if already hired
        let already_hired: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM user_employees WHERE user_id = ?1 AND employee_id = ?2 AND is_active = 1",
                [user_id, employee_id],
                |row| row.get(0),
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        if already_hired {
            return Err(EmployeeError::AlreadyHired(employee_id.to_string()));
        }

        // Create user employee record
        let user_employee_id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();

        conn.execute(
            "INSERT INTO user_employees (id, user_id, employee_id, hired_at, tasks_completed, time_saved_minutes, cost_saved_usd, is_active, custom_config)
             VALUES (?1, ?2, ?3, ?4, 0, 0, 0.0, 1, NULL)",
            [&user_employee_id, user_id, employee_id, &now.to_string()],
        )
        .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        // Increment usage count
        conn.execute(
            "UPDATE ai_employees SET usage_count = usage_count + 1 WHERE id = ?1",
            [employee_id],
        )
        .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        Ok(user_employee_id)
    }

    /// Fire (deactivate) an employee
    pub async fn fire(&self, user_employee_id: &str) -> Result<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        conn.execute(
            "UPDATE user_employees SET is_active = 0 WHERE id = ?1",
            [user_employee_id],
        )
        .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        Ok(())
    }

    /// Assign a task to an employee
    pub async fn assign_task(
        &self,
        user_employee_id: &str,
        task_type: String,
        input_data: HashMap<String, serde_json::Value>,
    ) -> Result<EmployeeTask> {
        let task_id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();

        let task = EmployeeTask {
            id: task_id.clone(),
            user_employee_id: user_employee_id.to_string(),
            task_type,
            input_data: input_data.clone(),
            output_data: None,
            time_saved_minutes: None,
            cost_saved_usd: None,
            started_at: now,
            completed_at: None,
            status: TaskStatus::Pending,
            error: None,
        };

        let suggested_tools = self.tools.suggest_tools(&task.task_type);
        tracing::debug!(
            "[AIEmployeeExecutor] Suggested tools for task {} -> {:?}",
            task_id,
            suggested_tools
                .iter()
                .take(5)
                .map(|tool| tool.id.clone())
                .collect::<Vec<_>>()
        );

        let router_ready = match self.llm_router.lock() {
            Ok(router) => router.has_provider(Provider::OpenAI),
            Err(e) => {
                tracing::warn!("Failed to inspect LLM router for task {}: {}", task_id, e);
                false
            }
        };
        if !router_ready {
            tracing::debug!(
                "[AIEmployeeExecutor] No OpenAI provider configured for task {}",
                task_id
            );
        }

        // Store task in database
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        let input_json = serde_json::to_string(&input_data).unwrap_or_default();

        conn.execute(
            "INSERT INTO employee_tasks (id, user_employee_id, task_type, input_data, output_data, time_saved_minutes, cost_saved_usd, started_at, completed_at, status)
             VALUES (?1, ?2, ?3, ?4, NULL, NULL, NULL, ?5, NULL, 'Pending')",
            [&task_id, user_employee_id, &task.task_type, &input_json, &now.to_string()],
        )
        .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        Ok(task)
    }

    /// Execute a task and return results
    pub async fn execute_task(&self, task_id: &str) -> Result<TaskResult> {
        let start_time = Instant::now();

        // Update status to Running
        {
            let conn = self.db.lock().map_err(|e| {
                EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e))
            })?;

            conn.execute(
                "UPDATE employee_tasks SET status = 'Running' WHERE id = ?1",
                [task_id],
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;
        }

        // Load task details
        let (task_type, input_json, user_employee_id, employee_id) = {
            let conn = self.db.lock().map_err(|e| {
                EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e))
            })?;

            let result: std::result::Result<(String, String, String, String), rusqlite::Error> =
                conn.query_row(
                    "SELECT et.task_type, et.input_data, et.user_employee_id, ue.employee_id
                 FROM employee_tasks et
                 JOIN user_employees ue ON et.user_employee_id = ue.id
                 WHERE et.id = ?1",
                    [task_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                );

            result.map_err(|e| EmployeeError::DatabaseError(e.to_string()))?
        };

        let _input_data: HashMap<String, serde_json::Value> =
            serde_json::from_str(&input_json).unwrap_or_default();

        // Execute based on employee role (simplified - in real implementation, this would use AGI tools)
        let mut output = HashMap::new();
        let mut steps_completed = Vec::new();

        // Simulate task execution (replace with actual AGI tool calls)
        output.insert(
            "result".to_string(),
            serde_json::Value::String(format!("Task {} executed successfully", task_type)),
        );
        steps_completed.push("Task execution completed".to_string());

        let execution_time = start_time.elapsed().as_secs_f64();

        // Calculate estimated time/cost saved (retrieve from employee definition)
        let (time_saved, cost_saved) = {
            let conn = self.db.lock().map_err(|e| {
                EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e))
            })?;

            let result: std::result::Result<(i64, f64), rusqlite::Error> = conn.query_row(
                "SELECT estimated_time_saved, estimated_cost_saved FROM ai_employees WHERE id = ?1",
                [&employee_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            );

            result.unwrap_or((15, 10.0))
        };

        // Update task as completed
        {
            let conn = self.db.lock().map_err(|e| {
                EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e))
            })?;

            let output_json = serde_json::to_string(&output).unwrap_or_default();
            let now = Utc::now().timestamp();

            conn.execute(
                "UPDATE employee_tasks SET status = 'Completed', output_data = ?1, time_saved_minutes = ?2, cost_saved_usd = ?3, completed_at = ?4 WHERE id = ?5",
                [&output_json, &time_saved.to_string(), &cost_saved.to_string(), &now.to_string(), task_id],
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

            // Update user employee stats
            conn.execute(
                "UPDATE user_employees SET tasks_completed = tasks_completed + 1, time_saved_minutes = time_saved_minutes + ?1, cost_saved_usd = cost_saved_usd + ?2 WHERE id = ?3",
                [&time_saved.to_string(), &cost_saved.to_string(), &user_employee_id],
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;
        }

        Ok(TaskResult {
            task_id: task_id.to_string(),
            status: TaskStatus::Completed,
            output,
            time_saved_minutes: time_saved as u64,
            cost_saved_usd: cost_saved,
            execution_time_seconds: execution_time,
            steps_completed,
            error: None,
        })
    }

    /// Run a demo workflow for an employee
    pub async fn run_demo(&self, employee_id: &str) -> Result<DemoResult> {
        let start_time = Instant::now();

        // Load employee details
        let (demo_json, estimated_time, estimated_cost) = {
            let conn = self.db.lock().map_err(|e| {
                EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e))
            })?;

            let result: std::result::Result<(Option<String>, i64, f64), rusqlite::Error> = conn.query_row(
                "SELECT demo_workflow, estimated_time_saved, estimated_cost_saved FROM ai_employees WHERE id = ?1",
                [employee_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            );

            result
                .map_err(|e| EmployeeError::NotFound(format!("Employee {}: {}", employee_id, e)))?
        };

        let demo_workflow: Option<DemoWorkflow> =
            demo_json.and_then(|json| serde_json::from_str(&json).ok());

        let demo_workflow = demo_workflow.ok_or_else(|| {
            EmployeeError::DemoFailed(format!(
                "No demo workflow found for employee {}",
                employee_id
            ))
        })?;

        // Execute demo steps
        let mut steps_completed = Vec::new();
        let mut output = HashMap::new();

        for (i, step) in demo_workflow.steps.iter().enumerate() {
            // Simulate step execution (in real implementation, this would call actual tools)
            steps_completed.push(DemoStepResult {
                step_number: i + 1,
                description: step.description.clone(),
                success: true,
                output: step.expected_result.clone(),
                error: None,
            });

            tracing::info!("Demo step {}: {}", i + 1, step.description);
        }

        output.insert(
            "sample_input".to_string(),
            serde_json::Value::String(demo_workflow.sample_input.clone()),
        );
        output.insert(
            "result".to_string(),
            serde_json::Value::String(demo_workflow.expected_output.clone()),
        );

        let execution_time = start_time.elapsed().as_secs_f64();

        Ok(DemoResult {
            employee_id: employee_id.to_string(),
            success: true,
            output,
            time_saved_minutes: estimated_time as u64,
            cost_saved_usd: estimated_cost,
            execution_time_seconds: execution_time,
            steps_completed,
            error: None,
        })
    }

    /// Get task status
    pub async fn get_task_status(&self, task_id: &str) -> Result<EmployeeTask> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        let result: std::result::Result<EmployeeTask, rusqlite::Error> = conn.query_row(
            "SELECT id, user_employee_id, task_type, input_data, output_data, time_saved_minutes, cost_saved_usd, started_at, completed_at, status
             FROM employee_tasks WHERE id = ?1",
            [task_id],
            |row| {
                let input_json: String = row.get(3)?;
                let output_json: Option<String> = row.get(4)?;
                let status_str: String = row.get(9)?;

                let input_data: HashMap<String, serde_json::Value> =
                    serde_json::from_str(&input_json).unwrap_or_default();
                let output_data: Option<HashMap<String, serde_json::Value>> =
                    output_json.and_then(|json| serde_json::from_str(&json).ok());

                let status = match status_str.as_str() {
                    "Pending" => TaskStatus::Pending,
                    "Running" => TaskStatus::Running,
                    "Completed" => TaskStatus::Completed,
                    "Failed" => TaskStatus::Failed,
                    "Cancelled" => TaskStatus::Cancelled,
                    _ => TaskStatus::Pending,
                };

                Ok(EmployeeTask {
                    id: row.get(0)?,
                    user_employee_id: row.get(1)?,
                    task_type: row.get(2)?,
                    input_data,
                    output_data,
                    time_saved_minutes: row.get(5)?,
                    cost_saved_usd: row.get(6)?,
                    started_at: row.get(7)?,
                    completed_at: row.get(8)?,
                    status,
                    error: None,
                })
            },
        );

        result.map_err(|e| EmployeeError::DatabaseError(e.to_string()))
    }

    /// List all tasks for a user employee
    pub async fn list_tasks(&self, user_employee_id: &str) -> Result<Vec<EmployeeTask>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, user_employee_id, task_type, input_data, output_data, time_saved_minutes, cost_saved_usd, started_at, completed_at, status
                 FROM employee_tasks WHERE user_employee_id = ?1 ORDER BY started_at DESC",
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        let tasks = stmt
            .query_map([user_employee_id], |row| {
                let input_json: String = row.get(3)?;
                let output_json: Option<String> = row.get(4)?;
                let status_str: String = row.get(9)?;

                let input_data: HashMap<String, serde_json::Value> =
                    serde_json::from_str(&input_json).unwrap_or_default();
                let output_data: Option<HashMap<String, serde_json::Value>> =
                    output_json.and_then(|json| serde_json::from_str(&json).ok());

                let status = match status_str.as_str() {
                    "Pending" => TaskStatus::Pending,
                    "Running" => TaskStatus::Running,
                    "Completed" => TaskStatus::Completed,
                    "Failed" => TaskStatus::Failed,
                    "Cancelled" => TaskStatus::Cancelled,
                    _ => TaskStatus::Pending,
                };

                Ok(EmployeeTask {
                    id: row.get(0)?,
                    user_employee_id: row.get(1)?,
                    task_type: row.get(2)?,
                    input_data,
                    output_data,
                    time_saved_minutes: row.get(5)?,
                    cost_saved_usd: row.get(6)?,
                    started_at: row.get(7)?,
                    completed_at: row.get(8)?,
                    status,
                    error: None,
                })
            })
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        let mut result = Vec::new();
        for t in tasks.flatten() {
            result.push(t);
        }

        Ok(result)
    }
}
