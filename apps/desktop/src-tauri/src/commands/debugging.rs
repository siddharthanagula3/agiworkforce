/**
 * Enhanced Debugging Capabilities
 * Error parsing, stack trace analysis, and AI-powered fix suggestions
 */
use crate::router::{ChatMessage, LLMRequest, LLMRouter, RouterPreferences};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

/// Parsed error information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedError {
    pub error_type: String,
    pub message: String,
    pub file_path: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub stack_trace: Vec<StackFrame>,
    pub severity: ErrorSeverity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorSeverity {
    Critical,
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StackFrame {
    pub function: String,
    pub file: String,
    pub line: u32,
    pub column: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DebugSuggestion {
    pub title: String,
    pub description: String,
    pub fix_code: Option<String>,
    pub confidence: f32,
    pub steps: Vec<String>,
}

/// Parse error message and extract structured information
#[tauri::command]
pub async fn debug_parse_error(error_text: String) -> Result<ParsedError, String> {
    tracing::info!("Parsing error message");

    // Parse TypeScript/JavaScript errors
    if error_text.contains("TS") || error_text.contains("Error:") {
        return parse_typescript_error(&error_text);
    }

    // Parse Rust errors
    if error_text.contains("error[E") || error_text.contains("error:") {
        return parse_rust_error(&error_text);
    }

    // Parse Python errors
    if error_text.contains("Traceback") || error_text.contains("File \"") {
        return parse_python_error(&error_text);
    }

    // Generic error parsing
    Ok(ParsedError {
        error_type: "Unknown".to_string(),
        message: error_text,
        file_path: None,
        line: None,
        column: None,
        stack_trace: vec![],
        severity: ErrorSeverity::Medium,
    })
}

/// Get AI-powered fix suggestions for an error
#[tauri::command]
pub async fn debug_suggest_fixes(
    error: ParsedError,
    source_code: Option<String>,
    router_state: State<'_, Arc<Mutex<LLMRouter>>>,
) -> Result<Vec<DebugSuggestion>, String> {
    tracing::info!("Generating fix suggestions for: {}", error.error_type);

    let context = if let Some(code) = source_code {
        format!("\n\nRelevant source code:\n```\n{}\n```", code)
    } else {
        String::new()
    };

    let prompt = format!(
        r#"Analyze this error and provide 2-3 specific fix suggestions.

Error Type: {}
Message: {}
{}{}

Provide solutions in JSON format:
[
  {{
    "title": "Brief title",
    "description": "Explanation of the fix",
    "fix_code": "Code snippet showing the fix (if applicable)",
    "confidence": 0.9,
    "steps": ["Step 1", "Step 2"]
  }}
]"#,
        error.error_type,
        error.message,
        error
            .file_path
            .map(|f| format!("File: {}\n", f))
            .unwrap_or_default(),
        context
    );

    let llm_request = LLMRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        model: "".to_string(), // Will be set by router
        max_tokens: Some(1500),
        temperature: Some(0.4),
        stream: false,
        tools: None,
        tool_choice: None,
    };

    let router = router_state.lock().await;
    let preferences = RouterPreferences::default();
    let candidates = router.candidates(&llm_request, &preferences);

    if candidates.is_empty() {
        return Err("No LLM providers configured".to_string());
    }

    let outcome = router
        .invoke_candidate(&candidates[0], &llm_request)
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    let json_str = extract_json(&outcome.response.content)?;
    serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse suggestions: {}", e))
}

/// Analyze stack trace and identify root cause
#[tauri::command]
pub async fn debug_analyze_stack_trace(
    stack_trace: Vec<StackFrame>,
    router_state: State<'_, Arc<Mutex<LLMRouter>>>,
) -> Result<StackTraceAnalysis, String> {
    tracing::info!("Analyzing stack trace with {} frames", stack_trace.len());

    let trace_text = stack_trace
        .iter()
        .enumerate()
        .map(|(i, frame)| {
            format!(
                "{}. {} at {}:{}",
                i + 1,
                frame.function,
                frame.file,
                frame.line
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let prompt = format!(
        r#"Analyze this stack trace and identify the root cause of the error.

Stack Trace:
{}

Provide analysis in JSON format:
{{
  "root_cause_frame": 0,
  "explanation": "Why this frame is the root cause",
  "error_path": "How the error propagated",
  "recommendations": ["Fix suggestion 1", "Fix suggestion 2"]
}}"#,
        trace_text
    );

    let llm_request = LLMRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        model: "".to_string(), // Will be set by router
        max_tokens: Some(1000),
        temperature: Some(0.3),
        stream: false,
        tools: None,
        tool_choice: None,
    };

    let router = router_state.lock().await;
    let preferences = RouterPreferences::default();
    let candidates = router.candidates(&llm_request, &preferences);

    if candidates.is_empty() {
        return Err("No LLM providers configured".to_string());
    }

    let outcome = router
        .invoke_candidate(&candidates[0], &llm_request)
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    let json_str = extract_json(&outcome.response.content)?;
    serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse analysis: {}", e))
}

// Parser implementations

fn parse_typescript_error(error_text: &str) -> Result<ParsedError, String> {
    let lines: Vec<&str> = error_text.lines().collect();

    let mut file_path = None;
    let mut line_num = None;
    let mut column = None;
    let mut message = String::new();
    let mut error_type = "TypeScript Error".to_string();

    for line in &lines {
        // Parse format: "file.ts(line,col): error TSxxxx: message"
        if let Some(colon_pos) = line.find("): ") {
            if let Some(paren_pos) = line.find('(') {
                file_path = Some(line[..paren_pos].trim().to_string());
                let coords = &line[paren_pos + 1..colon_pos];
                let parts: Vec<&str> = coords.split(',').collect();
                line_num = parts.first().and_then(|s| s.parse().ok());
                column = parts.get(1).and_then(|s| s.parse().ok());

                if let Some(msg_start) = line.find("error") {
                    message = line[msg_start..].to_string();
                    if let Some(ts_code) = line.find("TS") {
                        if let Some(colon) = line[ts_code..].find(':') {
                            error_type = line[ts_code..ts_code + colon].to_string();
                        }
                    }
                }
            }
        }
    }

    Ok(ParsedError {
        error_type,
        message,
        file_path,
        line: line_num,
        column,
        stack_trace: vec![],
        severity: ErrorSeverity::High,
    })
}

fn parse_rust_error(error_text: &str) -> Result<ParsedError, String> {
    let lines: Vec<&str> = error_text.lines().collect();

    let mut file_path = None;
    let mut line_num = None;
    let mut column = None;
    let mut message = String::new();
    let mut error_type = "Rust Error".to_string();

    for line in &lines {
        // Parse format: "error[E0xxx]: message"
        if line.trim().starts_with("error") {
            if let Some(bracket_start) = line.find('[') {
                if let Some(bracket_end) = line.find(']') {
                    error_type = line[bracket_start + 1..bracket_end].to_string();
                }
            }
            if let Some(colon_pos) = line.find(':') {
                message = line[colon_pos + 1..].trim().to_string();
            }
        }

        // Parse location: "--> src/main.rs:10:5"
        if line.contains("-->") {
            let parts: Vec<&str> = line.split("-->").collect();
            if let Some(location) = parts.get(1) {
                let location = location.trim();
                let parts: Vec<&str> = location.split(':').collect();
                file_path = parts.first().map(|s| s.to_string());
                line_num = parts.get(1).and_then(|s| s.parse().ok());
                column = parts.get(2).and_then(|s| s.parse().ok());
            }
        }
    }

    Ok(ParsedError {
        error_type,
        message,
        file_path,
        line: line_num,
        column,
        stack_trace: vec![],
        severity: ErrorSeverity::High,
    })
}

fn parse_python_error(error_text: &str) -> Result<ParsedError, String> {
    let lines: Vec<&str> = error_text.lines().collect();

    let mut stack_trace = Vec::new();
    let mut message = String::new();
    let mut error_type = "Python Error".to_string();

    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];

        // Parse traceback: 'File "path.py", line 10, in function'
        if line.contains("File \"") {
            if let Some(file_start) = line.find("File \"") {
                let file_end = line[file_start + 6..]
                    .find('"')
                    .map(|pos| file_start + 6 + pos);
                if let Some(file_end) = file_end {
                    let file = line[file_start + 6..file_end].to_string();

                    let line_num = if let Some(line_pos) = line.find("line ") {
                        line[line_pos + 5..]
                            .split(',')
                            .next()
                            .and_then(|s| s.trim().parse().ok())
                            .unwrap_or(0)
                    } else {
                        0
                    };

                    let function = if let Some(in_pos) = line.find("in ") {
                        line[in_pos + 3..].trim().to_string()
                    } else {
                        "<module>".to_string()
                    };

                    stack_trace.push(StackFrame {
                        function,
                        file,
                        line: line_num,
                        column: None,
                    });
                }
            }
        }

        // Parse error type and message from last line
        if line.contains("Error:") && i == lines.len() - 1 {
            if let Some(colon_pos) = line.find(':') {
                error_type = line[..colon_pos].trim().to_string();
                message = line[colon_pos + 1..].trim().to_string();
            }
        }

        i += 1;
    }

    let (file_path, line_num) = stack_trace
        .first()
        .map(|f| (Some(f.file.clone()), Some(f.line)))
        .unwrap_or((None, None));

    Ok(ParsedError {
        error_type,
        message,
        file_path,
        line: line_num,
        column: None,
        stack_trace,
        severity: ErrorSeverity::High,
    })
}

fn extract_json(text: &str) -> Result<String, String> {
    if let Some(start) = text.find('[') {
        if let Some(end) = text.rfind(']') {
            return Ok(text[start..=end].to_string());
        }
    }
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            return Ok(text[start..=end].to_string());
        }
    }
    Err("No JSON found in response".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StackTraceAnalysis {
    pub root_cause_frame: usize,
    pub explanation: String,
    pub error_path: String,
    pub recommendations: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_typescript_error() {
        let error = "src/file.ts(10,5): error TS2304: Cannot find name 'foo'.";
        let parsed = parse_typescript_error(error).unwrap();
        assert_eq!(parsed.file_path, Some("src/file.ts".to_string()));
        assert_eq!(parsed.line, Some(10));
        assert_eq!(parsed.column, Some(5));
    }
}
