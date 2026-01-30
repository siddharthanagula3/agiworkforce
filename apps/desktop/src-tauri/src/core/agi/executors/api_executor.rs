//! API operations executor.
//!
//! Handles HTTP API operations including calls, uploads, and downloads.
//! Delegates to the `api_tools_impl` module for actual implementation.
//!
//! # Supported Operations
//!
//! - `api_call`: Make HTTP API calls (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
//! - `api_upload`: Upload files via multipart form data
//! - `api_download`: Download files from URLs
//!
//! # Authentication Support
//!
//! All operations support multiple authentication methods:
//! - Bearer tokens
//! - Basic authentication (username/password)
//! - API keys (custom header)
//! - OAuth2 tokens
//!
//! # Security Considerations
//!
//! - Credentials should be retrieved from secure storage (OS keyring)
//! - HTTPS is recommended for all API calls
//! - Timeout limits prevent hanging on unresponsive servers

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::api_tools_impl;
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;

/// Executor for API operations.
///
/// Handles `api_call`, `api_upload`, and `api_download` tools.
/// Uses reqwest for HTTP operations with support for various authentication methods.
///
/// # Example Parameters
///
/// ## api_call
/// ```json
/// {
///     "method": "POST",
///     "url": "https://api.example.com/data",
///     "headers": {"Content-Type": "application/json"},
///     "body": {"key": "value"},
///     "auth": {"type": "bearer", "token": "xxx"},
///     "timeout_ms": 30000
/// }
/// ```
///
/// ## api_upload
/// ```json
/// {
///     "url": "https://api.example.com/upload",
///     "file_path": "/path/to/file.pdf",
///     "field_name": "document",
///     "fields": {"description": "My document"},
///     "auth": {"type": "apikey", "key": "xxx", "header": "X-API-Key"}
/// }
/// ```
///
/// ## api_download
/// ```json
/// {
///     "url": "https://example.com/file.pdf",
///     "save_path": "/path/to/save/file.pdf",
///     "auth": {"type": "basic", "username": "user", "password": "pass"}
/// }
/// ```
pub struct ApiExecutor;

impl ApiExecutor {
    /// Create a new API executor.
    pub fn new() -> Self {
        Self
    }

    /// Execute api_call operation.
    ///
    /// Makes an HTTP request to the specified URL with configurable method,
    /// headers, body, query parameters, and authentication.
    ///
    /// # Parameters
    ///
    /// - `method`: HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS) (required)
    /// - `url`: The target URL (required)
    /// - `headers`: Object of header key-value pairs (optional)
    /// - `query_params`: Object of query parameter key-value pairs (optional)
    /// - `body`: Request body (string or JSON object) (optional)
    /// - `auth`: Authentication configuration (optional)
    /// - `timeout_ms`: Request timeout in milliseconds (default: 30000)
    ///
    /// # Returns
    ///
    /// JSON object with:
    /// - `success`: Boolean indicating if request succeeded (2xx status)
    /// - `status`: HTTP status code
    /// - `body`: Parsed JSON body or string
    /// - `raw_body`: Raw response body as string
    /// - `duration_ms`: Request duration in milliseconds
    /// - `headers`: Response headers
    async fn execute_api_call(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let Some(ref app) = context.app_handle else {
            return Err(anyhow!(
                "Unable to make API calls right now. Please try again later."
            ));
        };

        context.emit_progress("Making API request...", Some(0.1));

        let result = api_tools_impl::execute_api_call(app, parameters).await;

        match &result {
            Ok(response) => {
                let status = response.get("status").and_then(|v| v.as_u64()).unwrap_or(0);
                tracing::info!(
                    "[ApiExecutor] api_call completed: status={} success={}",
                    status,
                    response
                        .get("success")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                );
            }
            Err(e) => {
                tracing::error!("[ApiExecutor] api_call failed: {}", e);
            }
        }

        result
    }

    /// Execute api_upload operation.
    ///
    /// Uploads a file to the specified URL using multipart form data.
    /// Supports additional form fields alongside the file.
    ///
    /// # Parameters
    ///
    /// - `url`: The upload endpoint URL (required)
    /// - `file_path`: Local path to the file to upload (required)
    /// - `field_name`: Form field name for the file (default: "file")
    /// - `fields`: Additional form fields as key-value pairs (optional)
    /// - `auth`: Authentication configuration (optional)
    ///
    /// # Returns
    ///
    /// JSON object with:
    /// - `success`: Boolean indicating if upload succeeded
    /// - `status`: HTTP status code
    /// - `body`: Parsed response body
    /// - `duration_ms`: Upload duration in milliseconds
    /// - `file_path`: The uploaded file path
    /// - `url`: The upload URL
    async fn execute_api_upload(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let Some(ref app) = context.app_handle else {
            return Err(anyhow!(
                "Unable to upload files right now. Please try again later."
            ));
        };

        let file_path = parameters
            .get("file_path")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        context.emit_progress(&format!("Uploading file: {}...", file_path), Some(0.1));

        let result = api_tools_impl::execute_api_upload(app, parameters).await;

        match &result {
            Ok(response) => {
                tracing::info!(
                    "[ApiExecutor] api_upload completed: file='{}' success={}",
                    file_path,
                    response
                        .get("success")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                );
            }
            Err(e) => {
                tracing::error!("[ApiExecutor] api_upload failed: {}", e);
            }
        }

        result
    }

    /// Execute api_download operation.
    ///
    /// Downloads a file from the specified URL and saves it to the local path.
    ///
    /// # Parameters
    ///
    /// - `url`: The URL to download from (required)
    /// - `save_path`: Local path to save the downloaded file (required)
    /// - `auth`: Authentication configuration (optional)
    ///
    /// # Returns
    ///
    /// JSON object with:
    /// - `success`: Boolean indicating if download succeeded
    /// - `status`: HTTP status code
    /// - `message`: Status message
    /// - `duration_ms`: Download duration in milliseconds
    /// - `url`: The download URL
    /// - `save_path`: The saved file path
    async fn execute_api_download(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let Some(ref app) = context.app_handle else {
            return Err(anyhow!(
                "Unable to download files right now. Please try again later."
            ));
        };

        let url = parameters
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        context.emit_progress(&format!("Downloading: {}...", url), Some(0.1));

        let result = api_tools_impl::execute_api_download(app, parameters).await;

        match &result {
            Ok(response) => {
                let save_path = response
                    .get("save_path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                tracing::info!(
                    "[ApiExecutor] api_download completed: url='{}' save_path='{}' success={}",
                    url,
                    save_path,
                    response
                        .get("success")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                );
            }
            Err(e) => {
                tracing::error!("[ApiExecutor] api_download failed: {}", e);
            }
        }

        result
    }
}

impl Default for ApiExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for ApiExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec!["api_call", "api_upload", "api_download"]
    }

    fn description(&self) -> &'static str {
        "Handles HTTP API operations including calls, uploads, and downloads \
        with support for various authentication methods."
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "api_call" => self.execute_api_call(parameters, context).await,
            "api_upload" => self.execute_api_upload(parameters, context).await,
            "api_download" => self.execute_api_download(parameters, context).await,
            _ => Err(anyhow!("Unknown API tool: {}", tool_name)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    /// Create a minimal test context for unit tests.
    ///
    /// Note: This context has no app_handle, so API operations will fail
    /// with "App handle not available" - this is expected for unit tests.
    /// Integration tests should use a real app handle.
    fn create_test_context() -> ExecutorContext {
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
    fn test_tool_names() {
        let executor = ApiExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"api_call"));
        assert!(names.contains(&"api_upload"));
        assert!(names.contains(&"api_download"));
        assert_eq!(names.len(), 3);
    }

    #[test]
    fn test_description() {
        let executor = ApiExecutor::new();
        let desc = executor.description();

        assert!(!desc.is_empty());
        assert!(desc.contains("API"));
        assert!(desc.contains("HTTP"));
    }

    #[test]
    fn test_default_impl() {
        let executor = ApiExecutor::default();
        assert_eq!(executor.tool_names().len(), 3);
    }

    #[tokio::test]
    async fn test_api_call_without_app_handle() {
        let context = create_test_context();
        let executor = ApiExecutor::new();
        let mut params = HashMap::new();
        params.insert("method".to_string(), Value::String("GET".to_string()));
        params.insert(
            "url".to_string(),
            Value::String("https://api.example.com".to_string()),
        );

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("api_call", &params, &context, &exec_context)
            .await;

        // Should fail because no app_handle is available
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Unable to make API calls"));
    }

    #[tokio::test]
    async fn test_api_upload_without_app_handle() {
        let context = create_test_context();
        let executor = ApiExecutor::new();
        let mut params = HashMap::new();
        params.insert(
            "url".to_string(),
            Value::String("https://api.example.com/upload".to_string()),
        );
        params.insert(
            "file_path".to_string(),
            Value::String("/path/to/file.txt".to_string()),
        );

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("api_upload", &params, &context, &exec_context)
            .await;

        // Should fail because no app_handle is available
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Unable to upload files"));
    }

    #[tokio::test]
    async fn test_api_download_without_app_handle() {
        let context = create_test_context();
        let executor = ApiExecutor::new();
        let mut params = HashMap::new();
        params.insert(
            "url".to_string(),
            Value::String("https://example.com/file.pdf".to_string()),
        );
        params.insert(
            "save_path".to_string(),
            Value::String("/path/to/save.pdf".to_string()),
        );

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("api_download", &params, &context, &exec_context)
            .await;

        // Should fail because no app_handle is available
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Unable to download files"));
    }

    #[tokio::test]
    async fn test_unknown_tool() {
        let context = create_test_context();
        let executor = ApiExecutor::new();
        let params = HashMap::new();

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("api_unknown", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Unknown API tool"));
    }
}
