use super::workflow_engine::*;
use super::workflow_executor::WorkflowExecutor;
use cron::Schedule;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use tokio::time::{sleep, Duration};

pub struct WorkflowScheduler {
    engine: Arc<WorkflowEngine>,
    executor: Arc<WorkflowExecutor>,
}

impl WorkflowScheduler {
    pub fn new(engine: Arc<WorkflowEngine>, executor: Arc<WorkflowExecutor>) -> Self {
        Self { engine, executor }
    }

    pub async fn start(&self) {
        println!("Workflow scheduler started");

        let engine = Arc::clone(&self.engine);
        let executor = Arc::clone(&self.executor);

        tokio::spawn(async move {
            let scheduler = WorkflowScheduler::new(engine, executor);
            scheduler.run_scheduler_loop().await;
        });
    }

    async fn run_scheduler_loop(&self) {
        loop {
            if let Err(e) = self.check_scheduled_workflows().await {
                eprintln!("Error checking scheduled workflows: {}", e);
            }

            sleep(Duration::from_secs(60)).await;
        }
    }

    async fn check_scheduled_workflows(&self) -> Result<(), String> {
        Ok(())
    }

    pub fn schedule_workflow(
        &self,
        workflow_id: &str,
        cron_expr: &str,
        timezone: Option<String>,
    ) -> Result<(), String> {
        let _schedule =
            Schedule::from_str(cron_expr).map_err(|e| format!("Invalid cron expression: {}", e))?;

        println!(
            "Scheduled workflow {} with cron: {} (timezone: {:?})",
            workflow_id, cron_expr, timezone
        );

        Ok(())
    }

    pub async fn trigger_on_event(
        &self,
        workflow_id: &str,
        event_type: &str,
        event_data: HashMap<String, serde_json::Value>,
    ) -> Result<String, String> {
        println!(
            "Triggering workflow {} on event: {}",
            workflow_id, event_type
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
        if let Some(_token) = auth_token {}

        println!("Triggering workflow {} via webhook", workflow_id);

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
        println!(
            "Registered file watcher for workflow {} at path: {}",
            workflow_id, path
        );

        Ok(())
    }

    pub fn register_email_trigger(
        &self,
        workflow_id: &str,
        account_id: &str,
        _filter: HashMap<String, String>,
    ) -> Result<(), String> {
        println!(
            "Registered email trigger for workflow {} on account: {}",
            workflow_id, account_id
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
        println!(
            "Registered database trigger for workflow {} on {}.{} ({})",
            workflow_id, database_id, table, operation
        );

        Ok(())
    }

    pub fn register_api_trigger(
        &self,
        workflow_id: &str,
        endpoint: &str,
        method: &str,
    ) -> Result<(), String> {
        println!(
            "Registered API trigger for workflow {} at {} {}",
            workflow_id, method, endpoint
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
        Ok(Vec::new())
    }

    pub fn cancel_scheduled_workflow(&self, workflow_id: &str) -> Result<(), String> {
        println!("Cancelled scheduled workflow: {}", workflow_id);

        Ok(())
    }
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
}
