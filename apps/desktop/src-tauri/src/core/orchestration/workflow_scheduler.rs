use super::workflow_engine::*;
use super::workflow_executor::WorkflowExecutor;
use chrono::Utc;
use cron::Schedule;
use std::collections::HashMap;
use std::panic::AssertUnwindSafe;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tokio::time::{sleep, Duration};

pub struct WorkflowScheduler {
    engine: Arc<WorkflowEngine>,
    executor: Arc<WorkflowExecutor>,
    scheduled_workflows: Arc<RwLock<HashMap<String, ScheduledWorkflow>>>,
    started: Arc<AtomicBool>,
}

impl WorkflowScheduler {
    pub fn new(engine: Arc<WorkflowEngine>, executor: Arc<WorkflowExecutor>) -> Self {
        Self {
            engine,
            executor,
            scheduled_workflows: Arc::new(RwLock::new(HashMap::new())),
            started: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self) -> bool {
        if self.started.swap(true, Ordering::SeqCst) {
            return true;
        }

        tracing::info!("Workflow scheduler started");

        let engine = Arc::clone(&self.engine);
        let executor = Arc::clone(&self.executor);
        let scheduled_workflows = Arc::clone(&self.scheduled_workflows);
        let started = Arc::clone(&self.started);

        let spawn_result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            tauri::async_runtime::spawn(async move {
                let scheduler = WorkflowScheduler {
                    engine,
                    executor,
                    scheduled_workflows,
                    started,
                };
                if let Err(e) = scheduler.run_scheduler_loop().await {
                    tracing::error!("Workflow scheduler loop failed: {}", e);
                    scheduler.started.store(false, Ordering::SeqCst);
                }
            });
        }));

        if spawn_result.is_err() {
            self.started.store(false, Ordering::SeqCst);
            tracing::warn!(
                "Workflow scheduler start deferred because no async runtime is available yet"
            );
            return false;
        }

        true
    }

    async fn run_scheduler_loop(&self) -> Result<(), String> {
        loop {
            if let Err(e) = self.check_scheduled_workflows().await {
                tracing::warn!("Error checking scheduled workflows: {}", e);
            }

            sleep(Duration::from_secs(60)).await;
        }
    }

    async fn check_scheduled_workflows(&self) -> Result<(), String> {
        let now = Utc::now().timestamp();
        let due_workflows = {
            let scheduled = self
                .scheduled_workflows
                .read()
                .map_err(|e| format!("Failed to read scheduled workflows: {e}"))?;
            scheduled
                .values()
                .filter(|workflow| {
                    workflow.enabled && workflow.next_execution.unwrap_or(i64::MAX) <= now
                })
                .cloned()
                .collect::<Vec<_>>()
        };

        for scheduled_workflow in due_workflows {
            let execution_result = self
                .executor
                .execute_workflow(scheduled_workflow.workflow_id.clone(), HashMap::new())
                .await;

            if let Err(error) = execution_result {
                tracing::warn!(
                    workflow_id = %scheduled_workflow.workflow_id,
                    "Scheduled workflow execution failed: {}",
                    error
                );
            }

            let mut scheduled = self
                .scheduled_workflows
                .write()
                .map_err(|e| format!("Failed to update scheduled workflows: {e}"))?;
            if let Some(entry) = scheduled.get_mut(&scheduled_workflow.workflow_id) {
                entry.last_execution = Some(now);
                entry.next_execution = Some(next_execution_timestamp(
                    entry.cron_expression.as_deref().unwrap_or_default(),
                    now,
                )?);
            }
        }

        Ok(())
    }

    pub fn schedule_workflow(
        &self,
        workflow_id: &str,
        cron_expr: &str,
        timezone: Option<String>,
    ) -> Result<(), String> {
        let next_execution = next_execution_timestamp(cron_expr, Utc::now().timestamp())?;

        tracing::info!(
            "Scheduled workflow {} with cron: {} (timezone: {:?})",
            workflow_id,
            cron_expr,
            timezone
        );

        self.scheduled_workflows
            .write()
            .map_err(|e| format!("Failed to store scheduled workflow: {e}"))?
            .insert(
                workflow_id.to_string(),
                ScheduledWorkflow {
                    workflow_id: workflow_id.to_string(),
                    workflow_name: workflow_id.to_string(),
                    trigger_type: "scheduled".to_string(),
                    cron_expression: Some(cron_expr.to_string()),
                    next_execution: Some(next_execution),
                    last_execution: None,
                    enabled: true,
                },
            );

        Ok(())
    }

    pub async fn trigger_on_event(
        &self,
        workflow_id: &str,
        event_type: &str,
        event_data: HashMap<String, serde_json::Value>,
    ) -> Result<String, String> {
        tracing::info!(
            "Triggering workflow {} on event: {}",
            workflow_id,
            event_type
        );

        self.executor
            .execute_workflow(workflow_id.to_string(), event_data)
            .await
    }

    pub async fn trigger_via_webhook(
        &self,
        workflow_id: &str,
        auth_token: Option<&str>,
        payload: HashMap<String, serde_json::Value>,
    ) -> Result<String, String> {
        let workflow = self.engine.get_workflow(workflow_id)?;
        let expected_auth_token = workflow.triggers.iter().find_map(|trigger| match trigger {
            WorkflowTrigger::Webhook { auth_token, .. } => auth_token.clone(),
            _ => None,
        });

        match expected_auth_token {
            Some(expected) if auth_token == Some(expected.as_str()) => {}
            Some(_) => return Err("Invalid webhook auth token".to_string()),
            None => return Err("Workflow is not configured with a webhook trigger".to_string()),
        }

        tracing::info!("Triggering workflow {} via webhook", workflow_id);

        self.executor
            .execute_workflow(workflow_id.to_string(), payload)
            .await
    }

    pub fn register_file_watcher_trigger(
        &self,
        workflow_id: &str,
        path: &str,
        _event_types: Vec<String>,
    ) -> Result<(), String> {
        tracing::info!(
            "Registered file watcher for workflow {} at path: {}",
            workflow_id,
            path
        );

        Ok(())
    }

    pub fn register_email_trigger(
        &self,
        workflow_id: &str,
        account_id: &str,
        _filter: HashMap<String, String>,
    ) -> Result<(), String> {
        tracing::info!(
            "Registered email trigger for workflow {} on account: {}",
            workflow_id,
            account_id
        );

        Ok(())
    }

    pub fn register_database_trigger(
        &self,
        workflow_id: &str,
        database_id: &str,
        table: &str,
        operation: &str,
    ) -> Result<(), String> {
        tracing::info!(
            "Registered database trigger for workflow {} on {}.{} ({})",
            workflow_id,
            database_id,
            table,
            operation
        );

        Ok(())
    }

    pub fn register_api_trigger(
        &self,
        workflow_id: &str,
        endpoint: &str,
        method: &str,
    ) -> Result<(), String> {
        tracing::info!(
            "Registered API trigger for workflow {} at {} {}",
            workflow_id,
            method,
            endpoint
        );

        Ok(())
    }

    pub fn get_next_execution_time(&self, cron_expr: &str) -> Result<i64, String> {
        let schedule =
            Schedule::from_str(cron_expr).map_err(|e| format!("Invalid cron expression: {}", e))?;

        let next = schedule
            .upcoming(chrono::Utc)
            .next()
            .ok_or_else(|| "No upcoming execution time".to_string())?;

        Ok(next.timestamp())
    }

    pub fn list_scheduled_workflows(
        &self,
        _user_id: &str,
    ) -> Result<Vec<ScheduledWorkflow>, String> {
        Ok(self
            .scheduled_workflows
            .read()
            .map_err(|e| format!("Failed to read scheduled workflows: {e}"))?
            .values()
            .cloned()
            .collect())
    }

    pub fn cancel_scheduled_workflow(&self, workflow_id: &str) -> Result<(), String> {
        if let Some(entry) = self
            .scheduled_workflows
            .write()
            .map_err(|e| format!("Failed to update scheduled workflows: {e}"))?
            .get_mut(workflow_id)
        {
            entry.enabled = false;
            entry.next_execution = None;
        }

        tracing::info!("Cancelled scheduled workflow: {}", workflow_id);

        Ok(())
    }
}

fn next_execution_timestamp(cron_expr: &str, after_timestamp: i64) -> Result<i64, String> {
    let schedule =
        Schedule::from_str(cron_expr).map_err(|e| format!("Invalid cron expression: {}", e))?;
    let after = chrono::DateTime::<Utc>::from_timestamp(after_timestamp, 0)
        .ok_or_else(|| format!("Invalid scheduler timestamp: {after_timestamp}"))?;

    schedule
        .after(&after)
        .next()
        .map(|datetime| datetime.timestamp())
        .ok_or_else(|| "No upcoming execution time".to_string())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScheduledWorkflow {
    pub workflow_id: String,
    pub workflow_name: String,
    pub trigger_type: String,
    pub cron_expression: Option<String>,
    pub next_execution: Option<i64>,
    pub last_execution: Option<i64>,
    pub enabled: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn test_cron_validation() {
        let result = Schedule::from_str("0 0 * * * *");
        assert!(result.is_ok());

        let result = Schedule::from_str("invalid");
        assert!(result.is_err());
    }

    #[test]
    fn test_next_execution_time() {
        let engine = Arc::new(WorkflowEngine::new(":memory:".to_string()));
        let executor = Arc::new(WorkflowExecutor::new(Arc::clone(&engine)));
        let scheduler = WorkflowScheduler::new(engine, executor);

        let result = scheduler.get_next_execution_time("0 0 * * * *");
        assert!(result.is_ok());
    }

    #[test]
    fn test_schedule_workflow_registers_runtime_schedule() {
        let engine = Arc::new(WorkflowEngine::new(":memory:".to_string()));
        let executor = Arc::new(WorkflowExecutor::new(Arc::clone(&engine)));
        let scheduler = WorkflowScheduler::new(engine, executor);

        scheduler
            .schedule_workflow("workflow-1", "0 0 * * * *", Some("UTC".to_string()))
            .unwrap();

        let scheduled = scheduler.list_scheduled_workflows("user-1").unwrap();
        assert_eq!(scheduled.len(), 1);
        assert_eq!(scheduled[0].workflow_id, "workflow-1");
        assert_eq!(scheduled[0].trigger_type, "scheduled");
        assert!(scheduled[0].next_execution.is_some());
    }

    #[test]
    fn test_cancel_scheduled_workflow_disables_runtime_schedule() {
        let engine = Arc::new(WorkflowEngine::new(":memory:".to_string()));
        let executor = Arc::new(WorkflowExecutor::new(Arc::clone(&engine)));
        let scheduler = WorkflowScheduler::new(engine, executor);

        scheduler
            .schedule_workflow("workflow-1", "0 0 * * * *", Some("UTC".to_string()))
            .unwrap();
        scheduler.cancel_scheduled_workflow("workflow-1").unwrap();

        let scheduled = scheduler.list_scheduled_workflows("user-1").unwrap();
        assert_eq!(scheduled.len(), 1);
        assert!(!scheduled[0].enabled);
        assert!(scheduled[0].next_execution.is_none());
    }

    #[tokio::test]
    async fn test_trigger_via_webhook_requires_matching_auth_token() {
        let db_path =
            std::env::temp_dir().join(format!("workflow-scheduler-{}.db", Uuid::new_v4()));
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE workflow_definitions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                nodes TEXT NOT NULL,
                edges TEXT NOT NULL,
                triggers TEXT NOT NULL,
                metadata TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
            [],
        )
        .unwrap();
        drop(conn);

        let engine = Arc::new(WorkflowEngine::new(db_path.to_string_lossy().to_string()));
        let workflow_id = engine
            .create_workflow(WorkflowDefinition {
                id: String::new(),
                user_id: "user-1".to_string(),
                name: "Webhook Workflow".to_string(),
                description: None,
                nodes: vec![],
                edges: vec![],
                triggers: vec![WorkflowTrigger::Webhook {
                    url: "https://example.com/hook".to_string(),
                    method: "POST".to_string(),
                    auth_token: Some("expected-secret".to_string()),
                }],
                metadata: HashMap::new(),
                created_at: 0,
                updated_at: 0,
            })
            .unwrap();
        let executor = Arc::new(WorkflowExecutor::new(Arc::clone(&engine)));
        let scheduler = WorkflowScheduler::new(engine, executor);

        let error = scheduler
            .trigger_via_webhook(&workflow_id, Some("wrong-secret"), HashMap::new())
            .await
            .unwrap_err();

        assert!(error.contains("Invalid webhook auth token"));

        let _ = fs::remove_file(&db_path);
    }
}
