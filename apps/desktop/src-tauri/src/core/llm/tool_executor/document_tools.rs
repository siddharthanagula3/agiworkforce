use super::*;
use crate::features::document::{build_generated_document_manifest, GeneratedDocumentKind};

fn created_document_tool_result(
    path: String,
    format: &'static str,
    kind: GeneratedDocumentKind,
    tool_id: &str,
) -> Result<ToolResult> {
    let bundle = build_generated_document_manifest(&path, kind)?;

    Ok(ToolResult {
        success: true,
        data: json!({
            "file_path": path.clone(),
            "filePath": path,
            "format": format,
            "status": "created",
            "success": true,
            "computeSession": bundle.compute_session,
            "generatedFile": bundle.generated_file,
            "artifactManifest": bundle.artifact_manifest
        }),
        error: None,
        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
    })
}

fn required_non_empty_string_array(
    args: &HashMap<String, Value>,
    name: &str,
) -> Result<Vec<String>> {
    let values = args
        .get(name)
        .and_then(|v| v.as_array())
        .ok_or_else(|| anyhow!("Missing or invalid {name} parameter"))?;

    let mut parsed = Vec::with_capacity(values.len());
    for (index, value) in values.iter().enumerate() {
        match value.as_str().map(str::trim) {
            Some(text) if !text.is_empty() => parsed.push(text.to_string()),
            _ => return Err(anyhow!("{name}[{index}] must be a non-empty string")),
        }
    }

    if parsed.is_empty() {
        return Err(anyhow!("{name} must contain at least one item"));
    }

    Ok(parsed)
}

fn required_string_matrix(args: &HashMap<String, Value>, name: &str) -> Result<Vec<Vec<String>>> {
    let rows = args
        .get(name)
        .and_then(|v| v.as_array())
        .ok_or_else(|| anyhow!("Missing or invalid {name} parameter"))?;

    let mut parsed_rows = Vec::with_capacity(rows.len());
    for (row_index, row) in rows.iter().enumerate() {
        let cells = row
            .as_array()
            .ok_or_else(|| anyhow!("{name}[{row_index}] must be an array"))?;

        let mut parsed_cells = Vec::with_capacity(cells.len());
        for (cell_index, cell) in cells.iter().enumerate() {
            let value = match cell {
                Value::String(text) => text.clone(),
                Value::Number(number) => number.to_string(),
                Value::Bool(boolean) => boolean.to_string(),
                Value::Null => String::new(),
                _ => {
                    return Err(anyhow!(
                    "{name}[{row_index}][{cell_index}] must be a string, number, boolean, or null"
                ))
                }
            };
            parsed_cells.push(value);
        }
        parsed_rows.push(parsed_cells);
    }

    Ok(parsed_rows)
}

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

            let paragraphs = required_non_empty_string_array(args, "paragraphs")?;

            match document_create_word_simple(output_path.clone(), title, author, paragraphs).await
            {
                Ok(path) => {
                    created_document_tool_result(path, "docx", GeneratedDocumentKind::Docx, tool_id)
                }
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

            let headers = required_non_empty_string_array(args, "headers")?;
            let rows = required_string_matrix(args, "rows")?;

            match document_create_excel_simple(output_path.clone(), sheet_name, headers, rows).await
            {
                Ok(path) => {
                    created_document_tool_result(path, "xlsx", GeneratedDocumentKind::Xlsx, tool_id)
                }
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

    pub(crate) async fn execute_document_edit_excel_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if self.app_handle.is_none() {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for document operations", "success": false }),
                error: Some("App handle not available for document operations".to_string()),
                metadata: HashMap::new(),
            });
        }

        use crate::sys::commands::document::document_edit_excel;

        let file_path = args
            .get("file_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing file_path parameter"))?
            .to_string();

        // Default to editing in place, which is what "edit this spreadsheet"
        // means to a user. An explicit output_path writes a copy instead.
        let output_path = args
            .get("output_path")
            .and_then(|v| v.as_str())
            .unwrap_or(&file_path)
            .to_string();

        let edits_value = args
            .get("edits")
            .ok_or_else(|| anyhow!("Missing edits parameter"))?;
        let edits = serde_json::from_value(edits_value.clone())
            .map_err(|e| anyhow!("Invalid edits payload: {}", e))?;

        match document_edit_excel(file_path, output_path.clone(), edits).await {
            Ok(path) => {
                created_document_tool_result(path, "xlsx", GeneratedDocumentKind::Xlsx, tool_id)
            }
            Err(e) => Ok(ToolResult {
                success: false,
                data: json!({ "error": format!("Failed to edit Excel document: {}", e), "success": false }),
                error: Some(format!("Failed to edit Excel document: {}", e)),
                metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
            }),
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

            let paragraphs = required_non_empty_string_array(args, "paragraphs")?;

            match document_create_pdf_simple(output_path.clone(), title, author, paragraphs).await {
                Ok(path) => {
                    created_document_tool_result(path, "pdf", GeneratedDocumentKind::Pdf, tool_id)
                }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_paragraph_payloads() {
        let mut args = HashMap::new();
        args.insert("paragraphs".to_string(), json!(["valid", {"bad": true}]));

        let error = required_non_empty_string_array(&args, "paragraphs")
            .expect_err("object paragraph must be rejected");

        assert!(error.to_string().contains("paragraphs[1]"));
    }

    #[test]
    fn parses_explicit_empty_excel_rows_without_silent_default() {
        let mut args = HashMap::new();
        args.insert("rows".to_string(), json!([]));

        let rows = required_string_matrix(&args, "rows").expect("empty explicit rows are valid");

        assert!(rows.is_empty());
    }

    #[test]
    fn rejects_nested_excel_cell_values() {
        let mut args = HashMap::new();
        args.insert("rows".to_string(), json!([["ok", {"bad": true}]]));

        let error =
            required_string_matrix(&args, "rows").expect_err("nested object cell must be rejected");

        assert!(error.to_string().contains("rows[0][1]"));
    }
}
