//! Productivity operations executor.
//!
//! Handles productivity tool integrations including task management
//! across Notion, Trello, and Asana, as well as document operations
//! for reading and searching PDF, DOCX, and other document formats.
//!
//! # Supported Tools
//!
//! - `productivity_create_task`: Create tasks in Notion, Trello, or Asana
//! - `document_read`: Read content from PDF, DOCX, Excel, and other documents
//! - `document_search`: Search within documents for specific queries
//!
//! # Provider Support
//!
//! Task creation supports a unified interface across:
//! - **Notion**: Creates pages in configured databases
//! - **Trello**: Creates cards on boards
//! - **Asana**: Creates tasks in projects
//!
//! All providers require prior connection via `productivity_connect` command.

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use std::collections::HashMap;

/// Executor for productivity operations.
///
/// Handles task management across multiple providers (Notion, Trello, Asana)
/// and document operations (reading, searching) for various file formats.
///
/// # Example
///
/// ```ignore
/// let executor = ProductivityExecutor::new();
/// let mut params = HashMap::new();
/// params.insert("provider".to_string(), json!("notion"));
/// params.insert("title".to_string(), json!("Review quarterly report"));
/// params.insert("description".to_string(), json!("Analyze Q4 metrics"));
///
/// let result = executor.execute(
///     "productivity_create_task",
///     &params,
///     &context,
///     &execution_context,
/// ).await?;
/// ```
pub struct ProductivityExecutor;

impl ProductivityExecutor {
    /// Create a new productivity executor.
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    /// Parse task priority from a JSON value.
    ///
    /// Accepts either a numeric value (1-255) or a string representation.
    /// Returns `None` for invalid or missing values.
    ///
    /// # Arguments
    ///
    /// * `value` - The JSON value containing the priority
    ///
    /// # Returns
    ///
    /// The priority as a `u8`, or `None` if parsing fails
    fn parse_task_priority(value: &Value) -> Option<u8> {
        if let Some(num) = value.as_u64() {
            return Some(num.min(u8::MAX as u64) as u8);
        }
        value.as_str().and_then(|s| s.parse::<u8>().ok())
    }

    /// Map a status string to the unified `TaskStatus` enum.
    ///
    /// Handles various status representations from different providers
    /// and normalizes them to the internal `TaskStatus` type.
    ///
    /// # Arguments
    ///
    /// * `status` - The status string (e.g., "todo", "in_progress", "done")
    ///
    /// # Returns
    ///
    /// The corresponding `TaskStatus` variant
    fn map_task_status(status: &str) -> crate::features::productivity::TaskStatus {
        crate::features::productivity::TaskStatus::from_notion_status(status)
    }

    /// Parse an RFC3339 timestamp string into a `DateTime<Utc>`.
    ///
    /// # Arguments
    ///
    /// * `value` - The timestamp string in RFC3339 format (e.g., "2024-01-15T10:30:00Z")
    ///
    /// # Returns
    ///
    /// The parsed `DateTime<Utc>`, or an error if parsing fails
    ///
    /// # Errors
    ///
    /// Returns an error if the input string is not a valid RFC3339 timestamp.
    fn parse_rfc3339_ts(value: &str) -> Result<DateTime<Utc>> {
        Ok(DateTime::parse_from_rfc3339(value)
            .map_err(|e| anyhow!("Invalid datetime '{}': {}", value, e))?
            .with_timezone(&Utc))
    }
}

impl Default for ProductivityExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for ProductivityExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec![
            "productivity_create_task",
            "document_read",
            "document_search",
        ]
    }

    fn description(&self) -> &'static str {
        "Productivity operations executor for task management (Notion, Trello, Asana) and document operations (PDF, DOCX)"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "productivity_create_task" => execute_create_task(parameters, context).await,
            "document_read" => execute_document_read(parameters, context).await,
            "document_search" => execute_document_search(parameters, context).await,
            _ => Err(anyhow!("Unknown productivity tool: {}", tool_name)),
        }
    }
}

/// Execute productivity_create_task operation.
///
/// Creates a task in a productivity tool (Notion, Trello, or Asana).
/// The provider must be connected via `productivity_connect` before creating tasks.
///
/// # Parameters
///
/// - `provider` (required): The provider name - "notion", "trello", or "asana"
/// - `title` (required): The task title
/// - `description` (optional): Detailed description of the task
/// - `status` (optional): Task status - "todo", "in_progress", "completed", "blocked", "cancelled"
/// - `priority` (optional): Priority level (1-255, higher = more urgent)
/// - `due_date` (optional): Due date in RFC3339 format (e.g., "2024-01-15T10:30:00Z")
/// - `assignee` (optional): User to assign the task to
/// - `project_id` (optional): ID of the project/board/database
/// - `project_name` (optional): Name of the project
/// - `url` (optional): Related URL
/// - `tags`/`labels` (optional): Array of string tags
///
/// # Returns
///
/// JSON object with:
/// - `success`: Boolean indicating success
/// - `task_id`: The ID of the created task
/// - `provider`: The provider name
/// - `title`: The task title
///
/// # Errors
///
/// Returns an error if:
/// - Required parameters are missing
/// - The provider is not recognized
/// - The provider is not connected
/// - Task creation fails on the provider's API
async fn execute_create_task(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let provider_str = parameters
        .get("provider")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'provider' parameter"))?;
    let title = parameters
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'title' parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "App handle not available for productivity task creation"
        ));
    };

    use crate::features::productivity::{Provider, Task, TaskStatus};
    use crate::sys::commands::ProductivityState;
    use tauri::Manager;

    let productivity_state = app.state::<ProductivityState>();

    let provider = match provider_str.to_lowercase().as_str() {
        "notion" => Provider::Notion,
        "trello" => Provider::Trello,
        "asana" => Provider::Asana,
        _ => {
            return Err(anyhow!(
                "Unknown productivity provider: {}. Supported: notion, trello, asana",
                provider_str
            ))
        }
    };

    // Build the task with all optional fields
    let mut task = Task::new(String::new(), title.to_string());

    // Set description if provided
    if let Some(desc) = parameters.get("description").and_then(|v| v.as_str()) {
        task.description = Some(desc.to_string());
    }

    // Set status (defaults to Todo)
    let status = parameters
        .get("status")
        .and_then(|v| v.as_str())
        .map(ProductivityExecutor::map_task_status)
        .unwrap_or(TaskStatus::Todo);
    task.status = status;

    // Set priority if provided
    task.priority = parameters
        .get("priority")
        .and_then(ProductivityExecutor::parse_task_priority);

    // Parse and set due date if provided
    task.due_date = match parameters.get("due_date").and_then(|v| v.as_str()) {
        Some(raw) => Some(
            ProductivityExecutor::parse_rfc3339_ts(raw)
                .map_err(|e| anyhow!("Invalid 'due_date': {}", e))?,
        ),
        None => None,
    };

    // Set assignee if provided
    if let Some(assignee) = parameters.get("assignee").and_then(|v| v.as_str()) {
        task.assignee = Some(assignee.to_string());
    }

    // Set project ID if provided
    if let Some(project_id) = parameters.get("project_id").and_then(|v| v.as_str()) {
        task.project_id = Some(project_id.to_string());
    }

    // Set project name if provided
    if let Some(project_name) = parameters.get("project_name").and_then(|v| v.as_str()) {
        task.project_name = Some(project_name.to_string());
    }

    // Set URL if provided
    if let Some(url) = parameters.get("url").and_then(|v| v.as_str()) {
        task.url = Some(url.to_string());
    }

    // Parse tags/labels - accepts either "tags" or "labels" parameter
    let tags_source = parameters.get("tags").or_else(|| parameters.get("labels"));
    task.tags = tags_source
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    // Create the task via the productivity manager
    let manager_arc = productivity_state.manager();
    let manager = manager_arc.lock().await;
    let task_id = manager.create_task(provider, task).await.map_err(|e| {
        anyhow!(
            "Failed to create productivity task: {}. Ensure the provider account is connected via productivity_connect.",
            e
        )
    })?;

    tracing::info!(
        "[ProductivityExecutor] Task created: provider={}, task_id={}, title={}",
        provider_str,
        task_id,
        title
    );

    Ok(json!({
        "success": true,
        "task_id": task_id,
        "provider": provider_str,
        "title": title
    }))
}

/// Execute document_read operation.
///
/// Reads a document file and returns its content in a structured format.
/// Supports various document formats including PDF, DOCX, XLSX, and more.
///
/// # Parameters
///
/// - `file_path` (required): Absolute path to the document file
///
/// # Returns
///
/// JSON object with:
/// - `success`: Boolean indicating success
/// - `file_path`: The path to the document
/// - `content`: The document content (structure varies by document type)
///
/// # Supported Formats
///
/// - **PDF**: Extracts text and metadata from PDF files
/// - **DOCX**: Parses Word documents including paragraphs and formatting
/// - **XLSX**: Reads Excel spreadsheets with sheet and cell data
/// - **TXT/Markdown**: Returns raw text content
///
/// # Errors
///
/// Returns an error if:
/// - The file_path parameter is missing
/// - The app handle is not available
/// - The file cannot be read or parsed
async fn execute_document_read(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let file_path = parameters
        .get("file_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'file_path' parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!("App handle not available for document operations"));
    };

    use crate::sys::commands::DocumentState;
    use tauri::Manager;

    let doc_state = app.state::<DocumentState>();
    let content = doc_state
        .manager
        .read_document(file_path)
        .await
        .map_err(|e| anyhow!("Document read failed: {}", e))?;

    tracing::info!(
        "[ProductivityExecutor] Document read: file_path={}",
        file_path
    );

    Ok(json!({
        "success": true,
        "file_path": file_path,
        "content": serde_json::to_value(&content).map_err(|e| anyhow!("Serialization failed: {}", e))?
    }))
}

/// Execute document_search operation.
///
/// Searches within a document for the specified query string.
/// Returns matching sections with context around each match.
///
/// # Parameters
///
/// - `file_path` (required): Absolute path to the document file
/// - `query` (required): The search query string
///
/// # Returns
///
/// JSON object with:
/// - `success`: Boolean indicating success
/// - `file_path`: The path to the document
/// - `query`: The search query used
/// - `results`: Array of search results with matched text and context
/// - `count`: Number of matches found
///
/// # Search Behavior
///
/// The search is case-insensitive and returns:
/// - The matching text
/// - Surrounding context (typically a paragraph or section)
/// - Location information within the document
///
/// # Errors
///
/// Returns an error if:
/// - Required parameters are missing
/// - The app handle is not available
/// - The document cannot be read or searched
async fn execute_document_search(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let file_path = parameters
        .get("file_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'file_path' parameter"))?;
    let query = parameters
        .get("query")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'query' parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!("App handle not available for document operations"));
    };

    use crate::sys::commands::DocumentState;
    use tauri::Manager;

    let doc_state = app.state::<DocumentState>();
    let results = doc_state
        .manager
        .search(file_path, query)
        .await
        .map_err(|e| anyhow!("Document search failed: {}", e))?;

    let result_count = results.len();

    tracing::info!(
        "[ProductivityExecutor] Document search: file_path={}, query='{}', matches={}",
        file_path,
        query,
        result_count
    );

    Ok(json!({
        "success": true,
        "file_path": file_path,
        "query": query,
        "results": serde_json::to_value(&results).map_err(|e| anyhow!("Serialization failed: {}", e))?,
        "count": result_count
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_context() -> ExecutorContext {
        use std::sync::Arc;

        ExecutorContext {
            app_handle: None,
            automation: Arc::new(
                crate::automation::AutomationService::new()
                    .expect("Failed to create AutomationService for tests"),
            ),
            router: Arc::new(tokio::sync::RwLock::new(crate::core::llm::LLMRouter::new())),
            tool_cache: Arc::new(crate::data::cache::ToolResultCache::new()),
            security_guard: Arc::new(crate::sys::security::ToolExecutionGuard::new()),
            change_tracker: None,
            session_id: "test_session".to_string(),
            tool_id: "test_tool".to_string(),
        }
    }

    fn create_test_execution_context() -> ExecutionContext {
        ExecutionContext {
            goal: crate::core::agi::Goal {
                id: "test".to_string(),
                description: "test".to_string(),
                priority: crate::core::agi::Priority::Medium,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            },
            current_state: HashMap::new(),
            available_resources: crate::core::agi::ResourceState {
                cpu_usage_percent: 0.0,
                memory_usage_mb: 0,
                network_usage_mbps: 0.0,
                storage_usage_mb: 0,
                available_tools: vec![],
            },
            tool_results: vec![],
            context_memory: vec![],
        }
    }

    #[test]
    fn test_productivity_executor_tool_names() {
        let executor = ProductivityExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"productivity_create_task"));
        assert!(names.contains(&"document_read"));
        assert!(names.contains(&"document_search"));
        assert_eq!(names.len(), 3);
    }

    #[test]
    fn test_productivity_executor_description() {
        let executor = ProductivityExecutor::new();
        let desc = executor.description();

        assert!(!desc.is_empty());
        assert!(desc.contains("Productivity"));
        assert!(desc.contains("task"));
    }

    #[test]
    fn test_default_impl() {
        let executor = ProductivityExecutor::default();
        assert_eq!(executor.tool_names().len(), 3);
    }

    #[test]
    fn test_parse_task_priority_numeric() {
        let value = json!(5);
        assert_eq!(ProductivityExecutor::parse_task_priority(&value), Some(5));
    }

    #[test]
    fn test_parse_task_priority_string() {
        let value = json!("10");
        assert_eq!(ProductivityExecutor::parse_task_priority(&value), Some(10));
    }

    #[test]
    fn test_parse_task_priority_overflow() {
        let value = json!(300);
        assert_eq!(ProductivityExecutor::parse_task_priority(&value), Some(255));
    }

    #[test]
    fn test_parse_task_priority_invalid() {
        let value = json!("invalid");
        assert_eq!(ProductivityExecutor::parse_task_priority(&value), None);
    }

    #[test]
    fn test_map_task_status() {
        use crate::features::productivity::TaskStatus;

        assert_eq!(
            ProductivityExecutor::map_task_status("todo"),
            TaskStatus::Todo
        );
        assert_eq!(
            ProductivityExecutor::map_task_status("in progress"),
            TaskStatus::InProgress
        );
        assert_eq!(
            ProductivityExecutor::map_task_status("done"),
            TaskStatus::Completed
        );
        assert_eq!(
            ProductivityExecutor::map_task_status("blocked"),
            TaskStatus::Blocked
        );
    }

    #[test]
    fn test_parse_rfc3339_ts_valid() {
        use chrono::Datelike;

        let result = ProductivityExecutor::parse_rfc3339_ts("2024-01-15T10:30:00Z");
        assert!(result.is_ok());
        let dt = result.unwrap();
        assert_eq!(dt.year(), 2024);
        assert_eq!(dt.month(), 1);
        assert_eq!(dt.day(), 15);
    }

    #[test]
    fn test_parse_rfc3339_ts_invalid() {
        let result = ProductivityExecutor::parse_rfc3339_ts("invalid-date");
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_execute_create_task_missing_provider() {
        let executor = ProductivityExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        let mut params = HashMap::new();
        params.insert("title".to_string(), json!("Test Task"));

        let result = executor
            .execute("productivity_create_task", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing 'provider' parameter"));
    }

    #[tokio::test]
    async fn test_execute_create_task_missing_title() {
        let executor = ProductivityExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        let mut params = HashMap::new();
        params.insert("provider".to_string(), json!("notion"));

        let result = executor
            .execute("productivity_create_task", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing 'title' parameter"));
    }

    #[tokio::test]
    async fn test_execute_create_task_invalid_provider() {
        let executor = ProductivityExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        let mut params = HashMap::new();
        params.insert("provider".to_string(), json!("invalid_provider"));
        params.insert("title".to_string(), json!("Test Task"));

        let result = executor
            .execute("productivity_create_task", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Unknown productivity provider"));
        assert!(err_msg.contains("Supported: notion, trello, asana"));
    }

    #[tokio::test]
    async fn test_execute_create_task_no_app_handle() {
        let executor = ProductivityExecutor::new();
        let context = create_test_context(); // Has no app_handle
        let exec_context = create_test_execution_context();

        let mut params = HashMap::new();
        params.insert("provider".to_string(), json!("notion"));
        params.insert("title".to_string(), json!("Test Task"));

        let result = executor
            .execute("productivity_create_task", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("App handle not available"));
    }

    #[tokio::test]
    async fn test_execute_document_read_missing_path() {
        let executor = ProductivityExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        let params = HashMap::new();

        let result = executor
            .execute("document_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing 'file_path' parameter"));
    }

    #[tokio::test]
    async fn test_execute_document_read_no_app_handle() {
        let executor = ProductivityExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        let mut params = HashMap::new();
        params.insert("file_path".to_string(), json!("/path/to/doc.pdf"));

        let result = executor
            .execute("document_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("App handle not available"));
    }

    #[tokio::test]
    async fn test_execute_document_search_missing_path() {
        let executor = ProductivityExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        let mut params = HashMap::new();
        params.insert("query".to_string(), json!("search term"));

        let result = executor
            .execute("document_search", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing 'file_path' parameter"));
    }

    #[tokio::test]
    async fn test_execute_document_search_missing_query() {
        let executor = ProductivityExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        let mut params = HashMap::new();
        params.insert("file_path".to_string(), json!("/path/to/doc.pdf"));

        let result = executor
            .execute("document_search", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing 'query' parameter"));
    }

    #[tokio::test]
    async fn test_execute_unknown_tool() {
        let executor = ProductivityExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        let params = HashMap::new();

        let result = executor
            .execute("unknown_tool", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Unknown productivity tool"));
    }
}
