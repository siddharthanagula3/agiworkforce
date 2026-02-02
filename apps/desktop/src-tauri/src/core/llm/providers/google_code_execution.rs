/// Google Gemini Code Execution Support
///
/// This module provides code execution capabilities for Google Gemini models.
/// Code execution runs in a sandboxed Python environment with libraries like
/// NumPy, Pandas, Matplotlib, and PIL available at no additional cost.
///
/// Features:
/// - Python code execution in secure sandbox
/// - Access to data analysis libraries (NumPy, Pandas)
/// - Visualization support (Matplotlib)
/// - Image processing (PIL)
/// - Text output (stdout/stderr)
/// - Generated images from plots
/// - FREE pricing (no cost for execution)
use serde::{Deserialize, Serialize};

/// Code execution configuration for Gemini models
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CodeExecutionConfig {
    /// Enable code execution in the request
    #[serde(default)]
    pub enabled: bool,
}

impl CodeExecutionConfig {
    /// Create a new code execution config with execution enabled
    pub fn enabled() -> Self {
        Self { enabled: true }
    }

    /// Create a new code execution config with execution disabled
    pub fn disabled() -> Self {
        Self { enabled: false }
    }
}

/// Result of code execution containing output and generated content
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CodeExecutionResult {
    /// Standard output from code execution
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdout: Option<String>,

    /// Standard error from code execution
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr: Option<String>,

    /// Generated images from code execution (e.g., matplotlib plots)
    /// Images are stored as base64-encoded PNG data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_images: Option<Vec<String>>,

    /// Exit code of the execution (0 for success, non-zero for errors)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,

    /// Execution status message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

impl CodeExecutionResult {
    /// Check if the code execution was successful
    pub fn is_success(&self) -> bool {
        self.exit_code.unwrap_or(1) == 0
    }

    /// Check if the result has any output
    pub fn has_output(&self) -> bool {
        self.stdout.is_some()
            || self.stderr.is_some()
            || self
                .output_images
                .as_ref()
                .is_some_and(|imgs| !imgs.is_empty())
    }

    /// Get formatted output combining stdout and stderr
    pub fn formatted_output(&self) -> String {
        let mut output = String::new();

        if let Some(stdout) = &self.stdout {
            if !stdout.is_empty() {
                output.push_str("Output:\n");
                output.push_str(stdout);
                output.push('\n');
            }
        }

        if let Some(stderr) = &self.stderr {
            if !stderr.is_empty() {
                if !output.is_empty() {
                    output.push('\n');
                }
                output.push_str("Errors:\n");
                output.push_str(stderr);
                output.push('\n');
            }
        }

        if let Some(images) = &self.output_images {
            if !images.is_empty() {
                if !output.is_empty() {
                    output.push('\n');
                }
                output.push_str(&format!("Generated {} image(s)\n", images.len()));
            }
        }

        output
    }

    /// Get the number of generated images
    pub fn image_count(&self) -> usize {
        self.output_images.as_ref().map_or(0, |imgs| imgs.len())
    }
}

/// Executable code block extracted from response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutableCode {
    /// Programming language (typically "python")
    pub language: String,

    /// Code content to execute
    pub code: String,
}

impl ExecutableCode {
    /// Create a new executable code block
    pub fn new(language: String, code: String) -> Self {
        Self { language, code }
    }

    /// Check if this is Python code
    pub fn is_python(&self) -> bool {
        self.language.to_lowercase() == "python"
    }
}

/// Response parts that may contain code execution results
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum GoogleCodePart {
    /// Text content
    Text { text: String },

    /// Executable code block
    ExecutableCode {
        #[serde(rename = "executableCode")]
        executable_code: ExecutableCode,
    },

    /// Code execution result
    CodeExecutionResult {
        #[serde(rename = "codeExecutionResult")]
        code_execution_result: CodeExecutionResultRaw,
    },
}

/// Raw code execution result from Gemini API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeExecutionResultRaw {
    /// Execution outcome
    pub outcome: String,

    /// Output from the code execution
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

impl From<CodeExecutionResultRaw> for CodeExecutionResult {
    fn from(raw: CodeExecutionResultRaw) -> Self {
        // Parse the outcome to determine success
        let is_success = raw.outcome.to_lowercase() == "outcome_ok";

        Self {
            stdout: raw.output.clone(),
            stderr: None,        // Gemini combines stdout/stderr in output
            output_images: None, // Images are in separate parts
            exit_code: Some(if is_success { 0 } else { 1 }),
            status: Some(raw.outcome),
        }
    }
}

/// Parse code execution results from Gemini response parts
pub fn parse_code_execution_results(parts: &[serde_json::Value]) -> Vec<CodeExecutionResult> {
    let mut results = Vec::new();

    for part in parts {
        if let Ok(GoogleCodePart::CodeExecutionResult {
            code_execution_result,
        }) = serde_json::from_value::<GoogleCodePart>(part.clone())
        {
            results.push(code_execution_result.into());
        }
    }

    results
}

/// Extract executable code blocks from Gemini response parts
pub fn extract_executable_code(parts: &[serde_json::Value]) -> Vec<ExecutableCode> {
    let mut code_blocks = Vec::new();

    for part in parts {
        if let Ok(GoogleCodePart::ExecutableCode { executable_code }) =
            serde_json::from_value::<GoogleCodePart>(part.clone())
        {
            code_blocks.push(executable_code);
        }
    }

    code_blocks
}

/// Build generation config with code execution enabled
pub fn build_code_execution_config() -> serde_json::Value {
    serde_json::json!({
        "codeExecution": {
            "enabled": true
        }
    })
}

/// Merge code execution config into existing generation config
pub fn merge_code_execution_config(
    mut generation_config: serde_json::Value,
    enable: bool,
) -> serde_json::Value {
    if enable {
        if let Some(obj) = generation_config.as_object_mut() {
            obj.insert(
                "codeExecution".to_string(),
                serde_json::json!({ "enabled": true }),
            );
        }
    }
    generation_config
}

/// Code execution tool definition for Gemini
/// This is automatically available in Gemini models and doesn't need to be
/// explicitly passed as a tool
pub fn code_execution_tool_definition() -> serde_json::Value {
    serde_json::json!({
        "codeExecution": {}
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_code_execution_config_default() {
        let config = CodeExecutionConfig::default();
        assert!(!config.enabled);
    }

    #[test]
    fn test_code_execution_config_enabled() {
        let config = CodeExecutionConfig::enabled();
        assert!(config.enabled);
    }

    #[test]
    fn test_code_execution_config_disabled() {
        let config = CodeExecutionConfig::disabled();
        assert!(!config.enabled);
    }

    #[test]
    fn test_code_execution_result_success() {
        let result = CodeExecutionResult {
            stdout: Some("Hello, World!".to_string()),
            stderr: None,
            output_images: None,
            exit_code: Some(0),
            status: Some("OUTCOME_OK".to_string()),
        };

        assert!(result.is_success());
        assert!(result.has_output());
        assert_eq!(result.image_count(), 0);
    }

    #[test]
    fn test_code_execution_result_failure() {
        let result = CodeExecutionResult {
            stdout: None,
            stderr: Some("Error: Division by zero".to_string()),
            output_images: None,
            exit_code: Some(1),
            status: Some("OUTCOME_FAILED".to_string()),
        };

        assert!(!result.is_success());
        assert!(result.has_output());
    }

    #[test]
    fn test_code_execution_result_with_images() {
        let result = CodeExecutionResult {
            stdout: Some("Generated plot".to_string()),
            stderr: None,
            output_images: Some(vec![
                "base64_image_data_1".to_string(),
                "base64_image_data_2".to_string(),
            ]),
            exit_code: Some(0),
            status: Some("OUTCOME_OK".to_string()),
        };

        assert!(result.is_success());
        assert!(result.has_output());
        assert_eq!(result.image_count(), 2);
    }

    #[test]
    fn test_code_execution_result_formatted_output() {
        let result = CodeExecutionResult {
            stdout: Some("Hello".to_string()),
            stderr: Some("Warning".to_string()),
            output_images: Some(vec!["img1".to_string()]),
            exit_code: Some(0),
            status: Some("OUTCOME_OK".to_string()),
        };

        let output = result.formatted_output();
        assert!(output.contains("Output:"));
        assert!(output.contains("Hello"));
        assert!(output.contains("Errors:"));
        assert!(output.contains("Warning"));
        assert!(output.contains("Generated 1 image(s)"));
    }

    #[test]
    fn test_executable_code_is_python() {
        let code = ExecutableCode::new("python".to_string(), "print('hello')".to_string());
        assert!(code.is_python());

        let code2 = ExecutableCode::new("PYTHON".to_string(), "print('hello')".to_string());
        assert!(code2.is_python());

        let code3 =
            ExecutableCode::new("javascript".to_string(), "console.log('hello')".to_string());
        assert!(!code3.is_python());
    }

    #[test]
    fn test_parse_code_execution_results() {
        let parts = vec![
            serde_json::json!({
                "text": "Some text"
            }),
            serde_json::json!({
                "codeExecutionResult": {
                    "outcome": "OUTCOME_OK",
                    "output": "42"
                }
            }),
        ];

        let results = parse_code_execution_results(&parts);
        assert_eq!(results.len(), 1);
        assert!(results[0].is_success());
        assert_eq!(results[0].stdout, Some("42".to_string()));
    }

    #[test]
    fn test_extract_executable_code() {
        let parts = vec![
            serde_json::json!({
                "text": "Here's the code:"
            }),
            serde_json::json!({
                "executableCode": {
                    "language": "python",
                    "code": "print('Hello, World!')"
                }
            }),
        ];

        let code_blocks = extract_executable_code(&parts);
        assert_eq!(code_blocks.len(), 1);
        assert_eq!(code_blocks[0].language, "python");
        assert_eq!(code_blocks[0].code, "print('Hello, World!')");
    }

    #[test]
    fn test_build_code_execution_config() {
        let config = build_code_execution_config();
        assert_eq!(
            config,
            serde_json::json!({
                "codeExecution": {
                    "enabled": true
                }
            })
        );
    }

    #[test]
    fn test_merge_code_execution_config() {
        let mut base_config = serde_json::json!({
            "temperature": 0.7,
            "maxOutputTokens": 2048
        });

        let merged = merge_code_execution_config(base_config.clone(), true);
        assert!(merged.get("codeExecution").is_some());
        assert_eq!(merged["codeExecution"]["enabled"], true);
        assert_eq!(merged["temperature"], 0.7);

        // Test with disabled flag
        base_config = serde_json::json!({
            "temperature": 0.7
        });
        let merged_disabled = merge_code_execution_config(base_config, false);
        assert!(merged_disabled.get("codeExecution").is_none());
    }

    #[test]
    fn test_code_execution_result_from_raw() {
        let raw = CodeExecutionResultRaw {
            outcome: "OUTCOME_OK".to_string(),
            output: Some("Result: 42".to_string()),
        };

        let result: CodeExecutionResult = raw.into();
        assert!(result.is_success());
        assert_eq!(result.stdout, Some("Result: 42".to_string()));
        assert_eq!(result.exit_code, Some(0));
    }

    #[test]
    fn test_code_execution_result_from_raw_failure() {
        let raw = CodeExecutionResultRaw {
            outcome: "OUTCOME_FAILED".to_string(),
            output: Some("Error message".to_string()),
        };

        let result: CodeExecutionResult = raw.into();
        assert!(!result.is_success());
        assert_eq!(result.exit_code, Some(1));
    }

    #[test]
    fn test_code_execution_tool_definition() {
        let tool_def = code_execution_tool_definition();
        assert_eq!(tool_def, serde_json::json!({ "codeExecution": {} }));
    }
}
