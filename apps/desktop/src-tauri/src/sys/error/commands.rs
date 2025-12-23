use super::{ErrorContext, RecoveryManager};
use crate::sys::error::categorization::Categorizable;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

pub struct ErrorContextStore {
    contexts: Arc<RwLock<HashMap<String, ErrorContext>>>,
    recovery_manager: Arc<RecoveryManager>,
}

impl ErrorContextStore {
    pub fn new() -> Self {
        Self {
            contexts: Arc::new(RwLock::new(HashMap::new())),
            recovery_manager: Arc::new(RecoveryManager::new()),
        }
    }

    pub async fn store(&self, context: ErrorContext) -> String {
        let id = context.id.clone();
        self.contexts.write().await.insert(id.clone(), context);
        id
    }

    pub async fn get(&self, id: &str) -> Option<ErrorContext> {
        self.contexts.read().await.get(id).cloned()
    }

    pub async fn remove(&self, id: &str) -> Option<ErrorContext> {
        self.contexts.write().await.remove(id)
    }

    pub fn recovery_manager(&self) -> &RecoveryManager {
        &self.recovery_manager
    }
}

impl Default for ErrorContextStore {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorContextResponse {
    pub id: String,
    pub error_type: String,
    pub message: String,
    pub timestamp: i64,
    pub step: Option<String>,
    pub tool: Option<String>,
    pub recovery_attempts: u32,
    pub user_message: String,
    pub category: String,
    pub suggested_action: String,
    pub is_retryable: bool,
}

impl From<ErrorContext> for ErrorContextResponse {
    fn from(ctx: ErrorContext) -> Self {
        Self {
            id: ctx.id,
            error_type: format!("{:?}", ctx.error),
            message: ctx.error.to_string(),
            timestamp: ctx.timestamp,
            step: ctx.step,
            tool: ctx.tool,
            recovery_attempts: ctx.recovery_attempts,
            user_message: ctx.user_message,
            category: format!("{:?}", ctx.category),
            suggested_action: ctx.suggested_action,
            is_retryable: ctx.error.is_retryable(),
        }
    }
}

#[tauri::command]
pub async fn get_error_context(
    error_id: String,
    store: State<'_, ErrorContextStore>,
) -> Result<ErrorContextResponse, String> {
    let context = store
        .get(&error_id)
        .await
        .ok_or_else(|| format!("Error context not found: {}", error_id))?;

    Ok(context.into())
}

#[tauri::command]
pub async fn get_all_error_contexts(
    store: State<'_, ErrorContextStore>,
) -> Result<Vec<ErrorContextResponse>, String> {
    let contexts = store.contexts.read().await;
    let responses: Vec<ErrorContextResponse> =
        contexts.values().cloned().map(|ctx| ctx.into()).collect();

    Ok(responses)
}

#[tauri::command]
pub async fn retry_failed_step(
    error_id: String,
    store: State<'_, ErrorContextStore>,
) -> Result<String, String> {
    let mut context = store
        .get(&error_id)
        .await
        .ok_or_else(|| format!("Error context not found: {}", error_id))?;

    if !context.error.is_retryable() {
        return Err("This error is not retryable".to_string());
    }

    context.increment_recovery_attempts();
    store.store(context).await;

    Ok(format!("Retry initiated for error {}", error_id))
}

#[tauri::command]
pub async fn skip_failed_step(
    error_id: String,
    store: State<'_, ErrorContextStore>,
) -> Result<String, String> {
    let context = store
        .remove(&error_id)
        .await
        .ok_or_else(|| format!("Error context not found: {}", error_id))?;

    tracing::info!("Skipped failed step: {}", context.error);

    Ok(format!("Step skipped for error {}", error_id))
}

#[tauri::command]
pub async fn abort_execution(
    error_id: String,
    store: State<'_, ErrorContextStore>,
) -> Result<String, String> {
    let context = store
        .remove(&error_id)
        .await
        .ok_or_else(|| format!("Error context not found: {}", error_id))?;

    tracing::warn!("Execution aborted due to error: {}", context.error);

    Ok(format!("Execution aborted for error {}", error_id))
}

#[tauri::command]
pub async fn clear_error_contexts(store: State<'_, ErrorContextStore>) -> Result<String, String> {
    let mut contexts = store.contexts.write().await;
    let count = contexts.len();
    contexts.clear();

    Ok(format!("Cleared {} error contexts", count))
}

#[tauri::command]
pub async fn get_recovery_suggestion(
    error_id: String,
    store: State<'_, ErrorContextStore>,
) -> Result<String, String> {
    let context = store
        .get(&error_id)
        .await
        .ok_or_else(|| format!("Error context not found: {}", error_id))?;

    let recovery_manager = store.recovery_manager();
    let action = recovery_manager
        .recover(&context.error)
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!("{:?}", action))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::error::AGIError;

    #[tokio::test]
    async fn test_error_context_store() {
        let store = ErrorContextStore::new();
        let error = AGIError::TransientError("Test error".to_string());
        let context = ErrorContext::new(error);
        let id = context.id.clone();

        let stored_id = store.store(context.clone()).await;
        assert_eq!(stored_id, id);

        let retrieved = store.get(&id).await;
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().id, id);

        let removed = store.remove(&id).await;
        assert!(removed.is_some());

        let not_found = store.get(&id).await;
        assert!(not_found.is_none());
    }
}
