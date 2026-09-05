//! Runs a routed call on the executor the tier named.
//!
//! A tier below the visual loop reuses the executor the AGI goal path already
//! owns, and clears the same approval gate and the same tool guard before it
//! runs. Routing decides where an action goes; it never decides whether the
//! action is allowed.

use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Manager;
use tokio::sync::RwLock;

use super::{ExecutorTier, RoutedCall};
use crate::automation::AutomationService;
use crate::core::agi::executor::require_tool_approval;
use crate::core::agi::executors::{
    ApiExecutor, BrowserExecutor, ExecutorContext, ToolExecutor, UiExecutor,
};
use crate::core::agi::{ExecutionContext, Goal, Priority, ResourceState};
use crate::core::llm::LLMRouter;
use crate::data::cache::ToolResultCache;
use crate::sys::commands::tool_confirmation::ToolConfirmationState;
use crate::sys::security::ToolExecutionGuard;

const VISUAL_TIER_HAS_NO_EXECUTOR: &str = "the visual loop is not dispatched through an executor";
const APP_HANDLE_REQUIRED: &str = "a routed call needs the desktop app handle";
const TOOL_ID_SEPARATOR: &str = "-";
const IDLE_RESOURCE_READING: f64 = 0.0;
const IDLE_RESOURCE_BYTES: u64 = 0;

/// A refusal and a failure are not interchangeable: a tool the user or the tool
/// guard refused must end the task, because falling through to the next tier
/// would run the same action through a driver that never asked.
#[derive(Debug)]
pub enum DispatchError {
    Denied(String),
    Failed(String),
}

impl fmt::Display for DispatchError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Denied(detail) | Self::Failed(detail) => formatter.write_str(detail),
        }
    }
}

pub struct TierDispatch {
    app_handle: Option<AppHandle>,
    automation: Arc<AutomationService>,
    llm_router: Arc<RwLock<LLMRouter>>,
    trust_mode: Option<agiworkforce_model_registry::TrustMode>,
}

impl TierDispatch {
    pub fn new(
        app_handle: Option<AppHandle>,
        automation: Arc<AutomationService>,
        llm_router: Arc<RwLock<LLMRouter>>,
        trust_mode: Option<agiworkforce_model_registry::TrustMode>,
    ) -> Self {
        Self {
            app_handle,
            automation,
            llm_router,
            trust_mode,
        }
    }

    pub async fn run(
        &self,
        call: &RoutedCall,
        task_id: &str,
        task_description: &str,
    ) -> Result<serde_json::Value, DispatchError> {
        let executor = self
            .executor_for(call.tier)
            .map_err(|error| DispatchError::Failed(error.to_string()))?;
        let app_handle = self
            .app_handle
            .as_ref()
            .ok_or_else(|| DispatchError::Failed(String::from(APP_HANDLE_REQUIRED)))?;

        require_tool_approval(
            app_handle,
            &call.tool,
            &call.parameters,
            Some(task_description),
        )
        .await
        .map_err(|error| DispatchError::Denied(error.to_string()))?;

        let guard = Arc::new(ToolExecutionGuard::new());
        let managed = app_handle.try_state::<ToolConfirmationState>();
        match &managed {
            Some(state) => {
                state
                    .tool_guard()
                    .validate_tool_call(&call.tool, &call.parameters)
                    .await
            }
            None => guard.validate_tool_call(&call.tool, &call.parameters).await,
        }
        .map_err(|error| DispatchError::Denied(error.to_string()))?;

        let parameters = parameter_map(&call.parameters);
        let tool_id = format!("{}{TOOL_ID_SEPARATOR}{}", call.tool, task_id);
        let executor_context = ExecutorContext {
            app_handle: Some(app_handle.clone()),
            automation: self.automation.clone(),
            router: self.llm_router.clone(),
            tool_cache: Arc::new(ToolResultCache::new()),
            security_guard: guard,
            change_tracker: None,
            session_id: task_id.to_string(),
            tool_id,
        };
        let execution_context = self.execution_context(task_id, task_description, &call.tool);

        executor
            .execute(
                &call.tool,
                &parameters,
                &executor_context,
                &execution_context,
            )
            .await
            .map_err(|error| DispatchError::Failed(error.to_string()))
    }

    fn executor_for(&self, tier: ExecutorTier) -> Result<Arc<dyn ToolExecutor>> {
        match tier {
            ExecutorTier::Api => Ok(Arc::new(ApiExecutor::new())),
            ExecutorTier::Ui => Ok(Arc::new(UiExecutor::new(self.automation.clone()))),
            ExecutorTier::Browser => Ok(Arc::new(BrowserExecutor::new(self.automation.clone()))),
            ExecutorTier::Visual => Err(anyhow!(VISUAL_TIER_HAS_NO_EXECUTOR)),
        }
    }

    fn execution_context(
        &self,
        task_id: &str,
        task_description: &str,
        tool: &str,
    ) -> ExecutionContext {
        ExecutionContext {
            goal: Goal {
                id: task_id.to_string(),
                description: task_description.to_string(),
                priority: Priority::Medium,
                deadline: None,
                constraints: Vec::new(),
                success_criteria: Vec::new(),
                trust_mode: self.trust_mode,
            },
            current_state: HashMap::new(),
            available_resources: ResourceState {
                cpu_usage_percent: IDLE_RESOURCE_READING,
                memory_usage_mb: IDLE_RESOURCE_BYTES,
                network_usage_mbps: IDLE_RESOURCE_READING,
                storage_usage_mb: IDLE_RESOURCE_BYTES,
                available_tools: vec![tool.to_string()],
            },
            tool_results: Vec::new(),
            context_memory: Vec::new(),
        }
    }
}

fn parameter_map(parameters: &serde_json::Value) -> HashMap<String, serde_json::Value> {
    parameters
        .as_object()
        .map(|object| {
            object
                .iter()
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_visual_tier_has_no_executor_to_dispatch_to() {
        let dispatch = TierDispatch::new(
            None,
            Arc::new(AutomationService::new().expect("automation service")),
            Arc::new(RwLock::new(LLMRouter::new())),
            None,
        );

        assert!(dispatch.executor_for(ExecutorTier::Visual).is_err());
        assert!(dispatch.executor_for(ExecutorTier::Ui).is_ok());
    }

    #[test]
    fn a_refusal_and_a_failure_stay_distinguishable() {
        let denied = DispatchError::Denied(String::from("you declined to run 'ui_click'."));
        let failed = DispatchError::Failed(String::from("element vanished"));

        assert!(matches!(denied, DispatchError::Denied(_)));
        assert!(matches!(failed, DispatchError::Failed(_)));
        assert_eq!(denied.to_string(), "you declined to run 'ui_click'.");
    }

    #[test]
    fn parameters_flatten_into_the_executor_map() {
        let parameters = serde_json::json!({ "url": "https://example.invalid" });

        assert_eq!(
            parameter_map(&parameters)
                .get("url")
                .and_then(|v| v.as_str()),
            Some("https://example.invalid")
        );
        assert!(parameter_map(&serde_json::Value::Null).is_empty());
    }
}
