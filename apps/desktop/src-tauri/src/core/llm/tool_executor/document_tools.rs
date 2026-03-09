use super::*;

impl ToolExecutor {
    pub(crate) async fn execute_document_read_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::document::{document_read, DocumentState};
            use tauri::Manager;

            let state = app.state::<DocumentState>();
            let file_path = args
                .get("file_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing file_path parameter"))?
                .to_string();

            match document_read(file_path.clone(), state).await {
                Ok(content) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "content": content,
                        "file_path": file_path
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to read document: {}", e), "success": false }),
                    error: Some(format!("Failed to read document: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for document operations", "success": false }),
                error: Some("App handle not available for document operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_document_search_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::document::{document_search, DocumentState};
            use tauri::Manager;

            let state = app.state::<DocumentState>();
            let file_path = args
                .get("file_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing file_path parameter"))?
                .to_string();

            let query = args
                .get("query")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing query parameter"))?
                .to_string();

            match document_search(file_path.clone(), query.clone(), state).await {
                Ok(results) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "results": results,
                        "file_path": file_path,
                        "query": query,
                        "count": results.len()
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to search document: {}", e), "success": false }),
                    error: Some(format!("Failed to search document: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for document operations", "success": false }),
                error: Some("App handle not available for document operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_document_create_word_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref _app) = self.app_handle {
            use crate::sys::commands::document::document_create_word_simple;

            let output_path = args
                .get("output_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing output_path parameter"))?
                .to_string();

            let title = args
                .get("title")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let author = args
                .get("author")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let paragraphs: Vec<String> = args
                .get("paragraphs")
                .map(|v| serde_json::from_value(v.clone()).unwrap_or_default())
                .unwrap_or_default();

            match document_create_word_simple(output_path.clone(), title, author, paragraphs).await
            {
                Ok(path) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "file_path": path,
                        "filePath": path,
                        "format": "docx",
                        "status": "created",
                        "success": true
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to create Word document: {}", e), "success": false }),
                    error: Some(format!("Failed to create Word document: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for document operations", "success": false }),
                error: Some("App handle not available for document operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_document_create_excel_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref _app) = self.app_handle {
            use crate::sys::commands::document::document_create_excel_simple;

            let output_path = args
                .get("output_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing output_path parameter"))?
                .to_string();

            let sheet_name = args
                .get("sheet_name")
                .and_then(|v| v.as_str())
                .unwrap_or("Sheet1")
                .to_string();

            let headers: Vec<String> = args
                .get("headers")
                .map(|v| serde_json::from_value(v.clone()).unwrap_or_default())
                .unwrap_or_default();

            let rows: Vec<Vec<String>> = args
                .get("rows")
                .map(|v| serde_json::from_value(v.clone()).unwrap_or_default())
                .unwrap_or_default();

            match document_create_excel_simple(output_path.clone(), sheet_name, headers, rows).await
            {
                Ok(path) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "file_path": path,
                        "filePath": path,
                        "format": "xlsx",
                        "status": "created",
                        "success": true
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to create Excel document: {}", e), "success": false }),
                    error: Some(format!("Failed to create Excel document: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for document operations", "success": false }),
                error: Some("App handle not available for document operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_document_create_pdf_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref _app) = self.app_handle {
            use crate::sys::commands::document::document_create_pdf_simple;

            let output_path = args
                .get("output_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing output_path parameter"))?
                .to_string();

            let title = args
                .get("title")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let author = args
                .get("author")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let paragraphs: Vec<String> = args
                .get("paragraphs")
                .map(|v| serde_json::from_value(v.clone()).unwrap_or_default())
                .unwrap_or_default();

            match document_create_pdf_simple(output_path.clone(), title, author, paragraphs).await {
                Ok(path) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "file_path": path,
                        "filePath": path,
                        "format": "pdf",
                        "status": "created",
                        "success": true
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to create PDF document: {}", e), "success": false }),
                    error: Some(format!("Failed to create PDF document: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for document operations", "success": false }),
                error: Some("App handle not available for document operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }
}
