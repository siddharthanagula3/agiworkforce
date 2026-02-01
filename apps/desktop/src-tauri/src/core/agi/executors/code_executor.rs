//! Code execution executor.
//!
//! Handles code execution in isolated sandbox environments and code analysis
//! operations. This executor provides a safe way for the AGI to run code
//! while preventing dangerous operations.
//!
//! # Security Model
//!
//! Code execution is performed in an isolated sandbox with:
//! - Restricted file system access (sandbox workspace only)
//! - Optional network isolation
//! - Memory limits
//! - Execution timeouts
//! - Dangerous pattern detection before execution
//!
//! # Supported Languages
//!
//! - Python (python, python3, py)
//! - JavaScript (javascript, js, node)
//! - TypeScript (typescript, ts)
//! - Bash (bash, sh, shell)
//! - PowerShell (powershell, ps1, pwsh)
//! - Ruby (ruby, rb)
//! - Perl (perl, pl)
//! - R (r, rscript)
//!
//! # Undo Capability
//!
//! Code execution is inherently not reversible, but the sandbox isolation
//! ensures that no persistent changes are made to the user's system.
//! All files created during execution are contained within the sandbox
//! and cleaned up after execution completes.

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use crate::ui::events::tool_stream::{emit_tool_output_chunk, emit_tool_progress, OutputChunkType};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;

/// Maximum code length allowed for execution (1MB).
const MAX_CODE_LENGTH: usize = 1024 * 1024;

/// Maximum code length allowed for analysis (500KB).
const MAX_ANALYSIS_CODE_LENGTH: usize = 512 * 1024;

/// Default memory limit for sandbox execution in MB.
const DEFAULT_MEMORY_LIMIT_MB: u64 = 512;

/// Executor for code execution and analysis operations.
///
/// Provides isolated code execution via the AGI sandbox system and
/// code structure analysis capabilities.
///
/// # Tools
///
/// - `code_execute`: Execute code in an isolated sandbox
/// - `code_analyze`: Analyze code structure and patterns
pub struct CodeExecutor;

impl CodeExecutor {
    /// Create a new code executor.
    pub fn new() -> Self {
        Self
    }

    /// Dangerous code patterns that are blocked before execution.
    ///
    /// These patterns represent operations that could:
    /// - Escape the sandbox
    /// - Perform destructive file system operations
    /// - Execute malicious network operations
    /// - Exhaust system resources
    const DANGEROUS_PATTERNS: &'static [DangerousPattern] = &[
        // File system escape attempts
        DangerousPattern {
            pattern: "os.chdir",
            language: Some("python"),
            description: "Directory change attempt",
            severity: Severity::Medium,
        },
        DangerousPattern {
            pattern: "os.system",
            language: Some("python"),
            description: "Shell command execution",
            severity: Severity::High,
        },
        DangerousPattern {
            pattern: "subprocess",
            language: Some("python"),
            description: "Subprocess execution",
            severity: Severity::High,
        },
        DangerousPattern {
            pattern: "eval(",
            language: None, // All languages
            description: "Dynamic code evaluation",
            severity: Severity::High,
        },
        DangerousPattern {
            pattern: "exec(",
            language: None,
            description: "Dynamic code execution",
            severity: Severity::High,
        },
        DangerousPattern {
            pattern: "__import__",
            language: Some("python"),
            description: "Dynamic module import",
            severity: Severity::Medium,
        },
        DangerousPattern {
            pattern: "require('child_process')",
            language: Some("javascript"),
            description: "Child process spawning",
            severity: Severity::High,
        },
        DangerousPattern {
            pattern: "child_process",
            language: Some("javascript"),
            description: "Child process module",
            severity: Severity::High,
        },
        DangerousPattern {
            pattern: "spawn(",
            language: Some("javascript"),
            description: "Process spawning",
            severity: Severity::High,
        },
        DangerousPattern {
            pattern: "execSync",
            language: Some("javascript"),
            description: "Synchronous command execution",
            severity: Severity::High,
        },
        DangerousPattern {
            pattern: "rm -rf",
            language: Some("bash"),
            description: "Recursive force delete",
            severity: Severity::Critical,
        },
        DangerousPattern {
            pattern: ":(){ :|:& };:",
            language: Some("bash"),
            description: "Fork bomb",
            severity: Severity::Critical,
        },
        DangerousPattern {
            pattern: "> /dev/",
            language: Some("bash"),
            description: "Device file write",
            severity: Severity::Critical,
        },
        DangerousPattern {
            pattern: "dd if=",
            language: Some("bash"),
            description: "Direct disk access",
            severity: Severity::Critical,
        },
        DangerousPattern {
            pattern: "curl | bash",
            language: Some("bash"),
            description: "Remote code execution via pipe",
            severity: Severity::Critical,
        },
        DangerousPattern {
            pattern: "wget | bash",
            language: Some("bash"),
            description: "Remote code execution via pipe",
            severity: Severity::Critical,
        },
        DangerousPattern {
            pattern: "| sh",
            language: Some("bash"),
            description: "Piped shell execution",
            severity: Severity::High,
        },
        DangerousPattern {
            pattern: "| bash",
            language: Some("bash"),
            description: "Piped bash execution",
            severity: Severity::High,
        },
        // Network exfiltration patterns
        DangerousPattern {
            pattern: "socket.connect",
            language: Some("python"),
            description: "Raw socket connection",
            severity: Severity::Medium,
        },
        DangerousPattern {
            pattern: "requests.post",
            language: Some("python"),
            description: "HTTP POST request (potential data exfiltration)",
            severity: Severity::Low,
        },
        // Privilege escalation
        DangerousPattern {
            pattern: "sudo ",
            language: None,
            description: "Privilege escalation attempt",
            severity: Severity::Critical,
        },
        DangerousPattern {
            pattern: "chmod 777",
            language: None,
            description: "Dangerous permission change",
            severity: Severity::High,
        },
        // System manipulation
        DangerousPattern {
            pattern: "shutdown",
            language: None,
            description: "System shutdown",
            severity: Severity::Critical,
        },
        DangerousPattern {
            pattern: "reboot",
            language: None,
            description: "System reboot",
            severity: Severity::Critical,
        },
        DangerousPattern {
            pattern: "init 0",
            language: None,
            description: "System halt",
            severity: Severity::Critical,
        },
    ];

    /// Validate code for dangerous patterns before execution.
    ///
    /// # Arguments
    ///
    /// * `code` - The code to validate
    /// * `language` - The programming language
    ///
    /// # Returns
    ///
    /// A list of detected dangerous patterns with their severity levels.
    fn validate_code(&self, code: &str, language: &str) -> Vec<&'static DangerousPattern> {
        let code_lower = code.to_lowercase();
        let language_lower = language.to_lowercase();

        Self::DANGEROUS_PATTERNS
            .iter()
            .filter(|pattern| {
                // Check if pattern applies to this language
                let language_matches = pattern
                    .language
                    .map(|l| language_lower.contains(l))
                    .unwrap_or(true);

                // Check if pattern is present in code
                let pattern_found = code_lower.contains(&pattern.pattern.to_lowercase());

                language_matches && pattern_found
            })
            .collect()
    }

    /// Check if code contains any critical severity patterns that must be blocked.
    ///
    /// # Arguments
    ///
    /// * `code` - The code to check
    /// * `language` - The programming language
    ///
    /// # Returns
    ///
    /// `Ok(())` if no critical patterns found, or an error with details.
    fn check_critical_patterns(&self, code: &str, language: &str) -> Result<()> {
        let dangerous = self.validate_code(code, language);
        let critical: Vec<_> = dangerous
            .iter()
            .filter(|p| matches!(p.severity, Severity::Critical))
            .collect();

        if !critical.is_empty() {
            let descriptions: Vec<_> = critical.iter().map(|p| p.description).collect();
            tracing::error!(
                "[CodeExecutor] SECURITY: Blocked code with critical patterns: {:?}",
                descriptions
            );
            return Err(anyhow!(
                "Code execution blocked: contains dangerous patterns ({})",
                descriptions.join(", ")
            ));
        }

        // Log warnings for non-critical patterns
        let warnings: Vec<_> = dangerous
            .iter()
            .filter(|p| !matches!(p.severity, Severity::Critical))
            .collect();

        if !warnings.is_empty() {
            let descriptions: Vec<_> = warnings.iter().map(|p| p.description).collect();
            tracing::warn!(
                "[CodeExecutor] Code contains potentially dangerous patterns: {:?}",
                descriptions
            );
        }

        Ok(())
    }

    /// Execute code in an isolated sandbox.
    ///
    /// # Parameters
    ///
    /// - `language` (required): Programming language (python, javascript, bash, etc.)
    /// - `code` (required): Code to execute
    /// - `timeout` / `timeout_secs` (optional): Execution timeout in seconds (default: 30, max: 60)
    /// - `stdin` (optional): Input to provide to the program
    /// - `allow_network` (optional): Whether to allow network access (default: false)
    /// - `env` / `env_vars` (optional): Environment variables as key-value pairs
    /// - `files` (optional): Additional files to create in sandbox before execution
    ///
    /// # Returns
    ///
    /// JSON object with execution results including stdout, stderr, exit code, etc.
    ///
    /// # Security
    ///
    /// - Code is validated for dangerous patterns before execution
    /// - Execution occurs in an isolated sandbox
    /// - Network access is disabled by default
    /// - Memory and time limits are enforced
    async fn execute_code(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let language = parameters
            .get("language")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'language' parameter"))?;
        let code = parameters
            .get("code")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'code' parameter"))?;

        // Validate code length
        if code.len() > MAX_CODE_LENGTH {
            return Err(anyhow!(
                "Code too long: {} bytes exceeds maximum of {} bytes",
                code.len(),
                MAX_CODE_LENGTH
            ));
        }

        // SECURITY: Validate code for dangerous patterns
        self.check_critical_patterns(code, language)?;

        // Parse optional parameters
        let timeout_secs = parameters
            .get("timeout")
            .and_then(|v| v.as_u64())
            .or_else(|| parameters.get("timeout_secs").and_then(|v| v.as_u64()));
        let stdin = parameters
            .get("stdin")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let allow_network = parameters
            .get("allow_network")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let env_vars = parameters
            .get("env")
            .or_else(|| parameters.get("env_vars"))
            .and_then(|v| v.as_object())
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect::<HashMap<String, String>>()
            });

        let files = parameters
            .get("files")
            .and_then(|v| v.as_object())
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect::<HashMap<String, String>>()
            });

        let tool_id = format!(
            "code_execute_{}",
            &context.session_id[..8.min(context.session_id.len())]
        );

        // Emit progress: creating sandbox
        if let Some(ref app) = context.app_handle {
            emit_tool_progress(app, &tool_id, 0.1, Some("Creating isolated sandbox..."));
        }

        // Create sandbox manager and execute code
        let sandbox_manager = crate::core::agi::SandboxManager::new()
            .map_err(|e| anyhow!("Failed to create sandbox manager: {}", e))?;

        // Emit progress: executing code
        if let Some(ref app) = context.app_handle {
            emit_tool_progress(
                app,
                &tool_id,
                0.3,
                Some(&format!("Executing {} code in sandbox...", language)),
            );
        }

        // Build execution configuration
        let exec_config = crate::core::agi::ExecutionConfig {
            language: language.to_string(),
            code: code.to_string(),
            stdin,
            timeout_secs,
            env_vars,
            allow_network,
            memory_limit_mb: Some(DEFAULT_MEMORY_LIMIT_MB),
            files,
        };

        // Execute code in sandbox
        let exec_result = sandbox_manager
            .execute_code(exec_config)
            .await
            .map_err(|e| anyhow!("Sandbox execution failed: {}", e))?;

        // Emit progress: processing result
        if let Some(ref app) = context.app_handle {
            emit_tool_progress(app, &tool_id, 0.9, Some("Processing execution result..."));
        }

        // Emit output chunks for streaming display
        if let Some(ref app) = context.app_handle {
            emit_tool_output_chunk(
                app,
                &tool_id,
                &format!(
                    "$ {} [{}]\n",
                    language,
                    if exec_result.success { "OK" } else { "FAILED" }
                ),
                OutputChunkType::Stdout,
                false,
            );

            if !exec_result.stdout.is_empty() {
                emit_tool_output_chunk(
                    app,
                    &tool_id,
                    &exec_result.stdout,
                    OutputChunkType::Stdout,
                    false,
                );
            }

            if !exec_result.stderr.is_empty() {
                emit_tool_output_chunk(
                    app,
                    &tool_id,
                    &exec_result.stderr,
                    OutputChunkType::Stderr,
                    false,
                );
            }

            emit_tool_output_chunk(
                app,
                &tool_id,
                &format!(
                    "\n[Exit code: {}] [Time: {}ms]\n",
                    exec_result
                        .exit_code
                        .map(|c| c.to_string())
                        .unwrap_or_else(|| "N/A".to_string()),
                    exec_result.execution_time_ms
                ),
                OutputChunkType::Stdout,
                true,
            );
        }

        // Emit terminal command event for UI
        if let Some(ref app) = context.app_handle {
            let terminal_cmd = crate::ui::events::TerminalCommand {
                id: uuid::Uuid::new_v4().to_string(),
                command: code.to_string(),
                cwd: exec_result.working_directory.clone(),
                exit_code: exec_result.exit_code,
                stdout: Some(exec_result.stdout.clone()),
                stderr: if exec_result.stderr.is_empty() {
                    None
                } else {
                    Some(exec_result.stderr.clone())
                },
                duration: Some(exec_result.execution_time_ms),
                session_id: Some(context.session_id.clone()),
                agent_id: None,
            };
            crate::ui::events::emit_terminal_command(app, terminal_cmd);
        }

        tracing::info!(
            "[CodeExecutor] code_execute completed: language={} success={} exit_code={:?} time={}ms",
            exec_result.language,
            exec_result.success,
            exec_result.exit_code,
            exec_result.execution_time_ms
        );

        // Return structured result
        if exec_result.success {
            Ok(json!({
                "success": true,
                "language": exec_result.language,
                "output": exec_result.output,
                "stdout": exec_result.stdout,
                "stderr": exec_result.stderr,
                "exit_code": exec_result.exit_code,
                "execution_time_ms": exec_result.execution_time_ms,
                "timed_out": exec_result.timed_out,
                "working_directory": exec_result.working_directory,
                "code_preview": &code[..code.len().min(100)]
            }))
        } else {
            Ok(json!({
                "success": false,
                "language": exec_result.language,
                "output": exec_result.output,
                "stdout": exec_result.stdout,
                "stderr": exec_result.stderr,
                "error": exec_result.error,
                "exit_code": exec_result.exit_code,
                "execution_time_ms": exec_result.execution_time_ms,
                "timed_out": exec_result.timed_out,
                "working_directory": exec_result.working_directory
            }))
        }
    }

    /// Analyze code structure and patterns.
    ///
    /// Performs static analysis on code to identify:
    /// - Language detection (if not specified)
    /// - Function and class definitions
    /// - Import/dependency analysis
    /// - Potential security issues
    /// - Code complexity metrics
    ///
    /// # Parameters
    ///
    /// - `code` (required): Code to analyze
    /// - `language` (optional): Programming language hint
    /// - `analysis_type` (optional): Type of analysis ("security", "structure", "all")
    ///
    /// # Returns
    ///
    /// JSON object with analysis results.
    async fn execute_analyze(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let code = parameters
            .get("code")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'code' parameter"))?;

        // Validate code length
        if code.len() > MAX_ANALYSIS_CODE_LENGTH {
            return Err(anyhow!(
                "Code too long for analysis: {} bytes exceeds maximum of {} bytes",
                code.len(),
                MAX_ANALYSIS_CODE_LENGTH
            ));
        }

        let language = parameters
            .get("language")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        let analysis_type = parameters
            .get("analysis_type")
            .and_then(|v| v.as_str())
            .unwrap_or("all");

        tracing::info!(
            "[CodeExecutor] code_analyze requested: language={} type={} code_len={}",
            language,
            analysis_type,
            code.len()
        );

        // Perform local static analysis - detect language if not specified
        let detected_language = if language == "unknown" {
            Some(self.detect_language(code))
        } else {
            Some(language.to_string())
        };
        let mut analysis = CodeAnalysis {
            detected_language,
            ..Default::default()
        };

        let effective_language = analysis.detected_language.as_deref().unwrap_or("unknown");

        // Security analysis
        if analysis_type == "security" || analysis_type == "all" {
            let dangerous = self.validate_code(code, effective_language);
            analysis.security_issues = dangerous
                .iter()
                .map(|p| SecurityIssue {
                    severity: format!("{:?}", p.severity),
                    description: p.description.to_string(),
                    pattern: p.pattern.to_string(),
                })
                .collect();
            analysis.has_security_issues = !analysis.security_issues.is_empty();
        }

        // Structure analysis
        if analysis_type == "structure" || analysis_type == "all" {
            analysis.line_count = code.lines().count();
            analysis.character_count = code.len();
            analysis.has_imports = self.detect_imports(code, effective_language);
            analysis.function_count = self.count_functions(code, effective_language);
            analysis.class_count = self.count_classes(code, effective_language);
        }

        // Try to use LLM for more detailed analysis if available
        if let Some(llm_analysis) = self
            .llm_analyze(code, effective_language, analysis_type, context)
            .await
        {
            analysis.llm_analysis = Some(llm_analysis);
        }

        tracing::info!(
            "[CodeExecutor] code_analyze completed: language={} issues={} functions={} classes={}",
            analysis.detected_language.as_deref().unwrap_or("unknown"),
            analysis.security_issues.len(),
            analysis.function_count,
            analysis.class_count
        );

        Ok(json!({
            "success": true,
            "analysis": {
                "detected_language": analysis.detected_language,
                "line_count": analysis.line_count,
                "character_count": analysis.character_count,
                "function_count": analysis.function_count,
                "class_count": analysis.class_count,
                "has_imports": analysis.has_imports,
                "has_security_issues": analysis.has_security_issues,
                "security_issues": analysis.security_issues,
                "llm_analysis": analysis.llm_analysis
            }
        }))
    }

    /// Attempt to detect the programming language from code content.
    fn detect_language(&self, code: &str) -> String {
        let code_lower = code.to_lowercase();

        // Python indicators
        if code.contains("def ")
            || code.contains("import ")
            || code.contains("from ")
            || code_lower.contains("print(")
        {
            return "python".to_string();
        }

        // JavaScript/TypeScript indicators
        if code.contains("function ")
            || code.contains("const ")
            || code.contains("let ")
            || code.contains("=>")
            || code.contains("require(")
        {
            if code.contains(": ") && (code.contains("interface ") || code.contains(": string")) {
                return "typescript".to_string();
            }
            return "javascript".to_string();
        }

        // Bash indicators
        if code.starts_with("#!/bin/bash")
            || code.starts_with("#!/bin/sh")
            || code.contains("echo ")
            || code.contains("if [")
        {
            return "bash".to_string();
        }

        // Ruby indicators
        if code.contains("def ")
            && (code.contains("end") || code.contains("puts ") || code.contains("require "))
        {
            return "ruby".to_string();
        }

        // PowerShell indicators
        if code.contains("$") && (code.contains("Write-Host") || code.contains("Get-")) {
            return "powershell".to_string();
        }

        "unknown".to_string()
    }

    /// Detect if code has import statements.
    fn detect_imports(&self, code: &str, language: &str) -> bool {
        match language {
            "python" | "py" => {
                code.contains("import ") || code.contains("from ") && code.contains(" import ")
            }
            "javascript" | "js" | "typescript" | "ts" => {
                code.contains("import ") || code.contains("require(")
            }
            "ruby" | "rb" => code.contains("require ") || code.contains("require_relative "),
            "bash" | "sh" => code.contains("source ") || code.contains(". "),
            _ => false,
        }
    }

    /// Count function definitions in code.
    fn count_functions(&self, code: &str, language: &str) -> usize {
        match language {
            "python" | "py" => code.matches("def ").count(),
            "javascript" | "js" | "typescript" | "ts" => {
                code.matches("function ").count()
                    + code.matches("=> {").count()
                    + code.matches("=>").count() / 2 // Rough estimate for arrow functions
            }
            "ruby" | "rb" => code.matches("def ").count(),
            "bash" | "sh" => code.matches("function ").count() + code.matches("() {").count(),
            _ => 0,
        }
    }

    /// Count class definitions in code.
    fn count_classes(&self, code: &str, language: &str) -> usize {
        match language {
            "python" | "py" => code.matches("class ").count(),
            "javascript" | "js" | "typescript" | "ts" => code.matches("class ").count(),
            "ruby" | "rb" => code.matches("class ").count(),
            _ => 0,
        }
    }

    /// Attempt LLM-based code analysis.
    ///
    /// Returns None if LLM is not available or analysis fails.
    async fn llm_analyze(
        &self,
        code: &str,
        language: &str,
        analysis_type: &str,
        context: &ExecutorContext,
    ) -> Option<String> {
        use crate::core::llm::{ChatMessage, LLMRequest, RouterPreferences, RoutingStrategy};

        // Limit code length for LLM analysis
        let code_preview = if code.len() > 4000 {
            format!("{}... [truncated]", &code[..4000])
        } else {
            code.to_string()
        };

        let prompt = format!(
            "Analyze the following {} code and provide a brief {} analysis:\n\n```{}\n{}\n```\n\n\
            Provide a concise analysis focusing on:\n\
            - Purpose and functionality\n\
            - Code quality observations\n\
            - Potential improvements\n\
            Keep the response under 200 words.",
            language, analysis_type, language, code_preview
        );

        let preferences = RouterPreferences {
            provider: Some(crate::core::llm::Provider::Anthropic),
            model: Some("claude-haiku-4-5".to_string()),
            strategy: RoutingStrategy::Auto,
            context: None,
            prefer_cloud_credits: false,
        };

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt,
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "claude-haiku-4-5".to_string(),
            temperature: Some(0.3),
            max_tokens: Some(500),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            ..Default::default()
        };

        let router = context.router.read().await;
        let candidates = router.candidates(&request, &preferences);

        if !candidates.is_empty() {
            match router.invoke_candidate(&candidates[0], &request).await {
                Ok(outcome) => {
                    drop(router);
                    Some(outcome.response.content)
                }
                Err(e) => {
                    drop(router);
                    tracing::debug!("[CodeExecutor] LLM analysis failed: {}", e);
                    None
                }
            }
        } else {
            drop(router);
            tracing::debug!("[CodeExecutor] No LLM candidates available for code analysis");
            None
        }
    }
}

impl Default for CodeExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for CodeExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec!["code_execute", "code_analyze"]
    }

    fn description(&self) -> &'static str {
        "Executes code in isolated sandboxes and analyzes code structure with security validation"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "code_execute" => self.execute_code(parameters, context).await,
            "code_analyze" => self.execute_analyze(parameters, context).await,
            _ => Err(anyhow!("Unknown code tool: {}", tool_name)),
        }
    }
}

/// Severity level for dangerous code patterns.
#[derive(Debug, Clone, Copy)]
enum Severity {
    /// Low severity - should be noted but not blocked
    Low,
    /// Medium severity - warning issued, execution allowed
    Medium,
    /// High severity - warning issued, execution allowed with caution
    High,
    /// Critical severity - execution blocked
    Critical,
}

/// A dangerous code pattern to detect.
#[derive(Debug)]
struct DangerousPattern {
    /// The pattern to search for
    pattern: &'static str,
    /// Language this pattern applies to (None = all languages)
    language: Option<&'static str>,
    /// Human-readable description
    description: &'static str,
    /// Severity level
    severity: Severity,
}

/// Security issue found during code analysis.
#[derive(Debug, Clone, serde::Serialize)]
struct SecurityIssue {
    severity: String,
    description: String,
    pattern: String,
}

/// Results from code analysis.
#[derive(Debug, Default)]
struct CodeAnalysis {
    detected_language: Option<String>,
    line_count: usize,
    character_count: usize,
    function_count: usize,
    class_count: usize,
    has_imports: bool,
    has_security_issues: bool,
    security_issues: Vec<SecurityIssue>,
    llm_analysis: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    /// Create a minimal test context for unit tests.
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
        let executor = CodeExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"code_execute"));
        assert!(names.contains(&"code_analyze"));
        assert_eq!(names.len(), 2);
    }

    #[test]
    fn test_description() {
        let executor = CodeExecutor::new();
        let desc = executor.description();

        assert!(!desc.is_empty());
        assert!(desc.contains("code") || desc.contains("sandbox"));
    }

    #[test]
    fn test_default_trait() {
        let executor = CodeExecutor::default();
        assert_eq!(executor.tool_names().len(), 2);
    }

    #[test]
    fn test_dangerous_pattern_detection_python() {
        let executor = CodeExecutor::new();

        // Safe Python code
        let safe_code = r#"
def hello():
    print("Hello, World!")
hello()
"#;
        let patterns = executor.validate_code(safe_code, "python");
        assert!(
            patterns.is_empty()
                || patterns
                    .iter()
                    .all(|p| !matches!(p.severity, Severity::Critical))
        );

        // Dangerous Python code
        let dangerous_code = "import os; os.system('rm -rf /')";
        let patterns = executor.validate_code(dangerous_code, "python");
        assert!(!patterns.is_empty());
        assert!(patterns.iter().any(|p| p.pattern.contains("os.system")));
    }

    #[test]
    fn test_dangerous_pattern_detection_bash() {
        let executor = CodeExecutor::new();

        // Safe bash code
        let safe_code = "echo 'Hello, World!'";
        let patterns = executor.validate_code(safe_code, "bash");
        let critical: Vec<_> = patterns
            .iter()
            .filter(|p| matches!(p.severity, Severity::Critical))
            .collect();
        assert!(critical.is_empty());

        // Dangerous bash code - fork bomb
        let fork_bomb = ":(){ :|:& };:";
        let patterns = executor.validate_code(fork_bomb, "bash");
        assert!(patterns
            .iter()
            .any(|p| matches!(p.severity, Severity::Critical)));

        // Dangerous bash code - rm -rf
        let rm_code = "rm -rf /";
        let patterns = executor.validate_code(rm_code, "bash");
        assert!(patterns
            .iter()
            .any(|p| matches!(p.severity, Severity::Critical)));
    }

    #[test]
    fn test_dangerous_pattern_detection_javascript() {
        let executor = CodeExecutor::new();

        // Safe JavaScript code
        let safe_code = "console.log('Hello, World!');";
        let patterns = executor.validate_code(safe_code, "javascript");
        let critical: Vec<_> = patterns
            .iter()
            .filter(|p| matches!(p.severity, Severity::Critical))
            .collect();
        assert!(critical.is_empty());

        // Dangerous JavaScript code - child_process
        let dangerous_code = "const { exec } = require('child_process'); exec('rm -rf /');";
        let patterns = executor.validate_code(dangerous_code, "javascript");
        assert!(!patterns.is_empty());
    }

    #[test]
    fn test_check_critical_patterns() {
        let executor = CodeExecutor::new();

        // Safe code should pass
        let safe_code = "print('hello')";
        assert!(executor
            .check_critical_patterns(safe_code, "python")
            .is_ok());

        // Critical pattern should be blocked
        let dangerous_code = "sudo rm -rf /";
        assert!(executor
            .check_critical_patterns(dangerous_code, "bash")
            .is_err());
    }

    #[test]
    fn test_language_detection() {
        let executor = CodeExecutor::new();

        // Python detection
        let python_code = "def foo():\n    print('hello')";
        assert_eq!(executor.detect_language(python_code), "python");

        // JavaScript detection
        let js_code = "const foo = () => { console.log('hello'); };";
        assert_eq!(executor.detect_language(js_code), "javascript");

        // Bash detection
        let bash_code = "#!/bin/bash\necho 'hello'";
        assert_eq!(executor.detect_language(bash_code), "bash");
    }

    #[test]
    fn test_import_detection() {
        let executor = CodeExecutor::new();

        // Python imports
        assert!(executor.detect_imports("import os", "python"));
        assert!(executor.detect_imports("from os import path", "python"));
        assert!(!executor.detect_imports("print('hello')", "python"));

        // JavaScript imports
        assert!(executor.detect_imports("import fs from 'fs'", "javascript"));
        assert!(executor.detect_imports("const fs = require('fs')", "javascript"));
        assert!(!executor.detect_imports("console.log('hello')", "javascript"));
    }

    #[test]
    fn test_function_counting() {
        let executor = CodeExecutor::new();

        // Python functions
        let python_code = "def foo():\n    pass\ndef bar():\n    pass";
        assert_eq!(executor.count_functions(python_code, "python"), 2);

        // JavaScript functions
        let js_code = "function foo() {} function bar() {}";
        assert!(executor.count_functions(js_code, "javascript") >= 2);
    }

    #[test]
    fn test_class_counting() {
        let executor = CodeExecutor::new();

        // Python classes
        let python_code = "class Foo:\n    pass\nclass Bar:\n    pass";
        assert_eq!(executor.count_classes(python_code, "python"), 2);

        // JavaScript classes
        let js_code = "class Foo {} class Bar {}";
        assert_eq!(executor.count_classes(js_code, "javascript"), 2);
    }

    #[tokio::test]
    async fn test_missing_code_parameter() {
        let context = create_test_context();
        let executor = CodeExecutor::new();
        let exec_context = create_test_execution_context();

        // Missing code parameter
        let mut params = HashMap::new();
        params.insert("language".to_string(), Value::String("python".to_string()));

        let result = executor
            .execute("code_execute", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing required 'code' parameter"));
    }

    #[tokio::test]
    async fn test_missing_language_parameter() {
        let context = create_test_context();
        let executor = CodeExecutor::new();
        let exec_context = create_test_execution_context();

        // Missing language parameter
        let mut params = HashMap::new();
        params.insert(
            "code".to_string(),
            Value::String("print('hello')".to_string()),
        );

        let result = executor
            .execute("code_execute", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing required 'language' parameter"));
    }

    #[tokio::test]
    async fn test_unknown_tool() {
        let context = create_test_context();
        let executor = CodeExecutor::new();
        let exec_context = create_test_execution_context();
        let params = HashMap::new();

        let result = executor
            .execute("code_unknown", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Unknown code tool"));
    }

    #[tokio::test]
    async fn test_code_analyze_missing_code() {
        let context = create_test_context();
        let executor = CodeExecutor::new();
        let exec_context = create_test_execution_context();
        let params = HashMap::new();

        let result = executor
            .execute("code_analyze", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing required 'code' parameter"));
    }

    #[tokio::test]
    async fn test_code_analyze_success() {
        let context = create_test_context();
        let executor = CodeExecutor::new();
        let exec_context = create_test_execution_context();

        let mut params = HashMap::new();
        params.insert(
            "code".to_string(),
            Value::String("def hello():\n    print('Hello, World!')".to_string()),
        );
        params.insert("language".to_string(), Value::String("python".to_string()));

        let result = executor
            .execute("code_analyze", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let value = result.unwrap();
        assert_eq!(value["success"], true);
        assert!(value["analysis"]["line_count"].as_u64().unwrap() > 0);
        assert_eq!(value["analysis"]["function_count"], 1);
    }

    #[tokio::test]
    async fn test_critical_pattern_blocked() {
        let context = create_test_context();
        let executor = CodeExecutor::new();
        let exec_context = create_test_execution_context();

        let mut params = HashMap::new();
        params.insert("language".to_string(), Value::String("bash".to_string()));
        params.insert(
            "code".to_string(),
            Value::String("sudo rm -rf /".to_string()),
        );

        let result = executor
            .execute("code_execute", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("blocked"));
    }

    #[tokio::test]
    async fn test_code_too_long() {
        let context = create_test_context();
        let executor = CodeExecutor::new();
        let exec_context = create_test_execution_context();

        // Create code that exceeds MAX_CODE_LENGTH
        let long_code = "x".repeat(MAX_CODE_LENGTH + 1);
        let mut params = HashMap::new();
        params.insert("language".to_string(), Value::String("python".to_string()));
        params.insert("code".to_string(), Value::String(long_code));

        let result = executor
            .execute("code_execute", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("too long"));
    }
}
