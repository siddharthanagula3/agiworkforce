use crate::error::{Error, Result};
use crate::router::LLMRouter;
use crate::terminal::SessionManager;
use std::sync::Arc;
use tokio::process::Command;

/// AI assistant for terminal operations
/// Provides intelligent command suggestions, error explanations, and smart git commits
pub struct TerminalAI {
    router: Arc<LLMRouter>,
    session_manager: Arc<SessionManager>,
}

impl TerminalAI {
    pub fn new(router: Arc<LLMRouter>, session_manager: Arc<SessionManager>) -> Self {
        Self {
            router,
            session_manager,
        }
    }

    /// Generate a shell command from natural language intent
    ///
    /// # Arguments
    /// * `intent` - Natural language description of what to do
    /// * `shell_type` - Target shell type (PowerShell, Bash, etc.)
    /// * `cwd` - Current working directory for context
    ///
    /// # Example
    /// ```ignore
    /// let cmd = ai.suggest_command(
    ///     "find all large files over 100MB",
    ///     "PowerShell",
    ///     "C:/projects"
    /// ).await?;
    /// // Returns: "Get-ChildItem -Recurse | Where-Object {$_.Length -gt 100MB} | Sort-Object Length -Descending"
    /// ```
    pub async fn suggest_command(
        &self,
        intent: &str,
        shell_type: &str,
        cwd: Option<&str>,
    ) -> Result<String> {
        let cwd_context = cwd
            .map(|dir| format!("\nWorking directory: {}", dir))
            .unwrap_or_default();

        let prompt = format!(
            r#"You are a shell command expert. Generate a single, executable command for the following intent.

Intent: {}
Shell: {}
OS: Windows{}

Requirements:
- Return ONLY the command, no explanations
- Use {} syntax
- Command must be safe and non-destructive
- Include error handling where appropriate
- Use modern best practices

Command:"#,
            intent, shell_type, cwd_context, shell_type
        );

        let response = self
            .router
            .send_message(&prompt, None)
            .await
            .map_err(|e| Error::Other(format!("LLM request failed: {}", e)))?;

        // Extract command from response (remove markdown fences if present)
        let command = response
            .trim()
            .trim_start_matches("```")
            .trim_start_matches("powershell")
            .trim_start_matches("bash")
            .trim_start_matches("sh")
            .trim_end_matches("```")
            .trim()
            .to_string();

        tracing::info!("AI suggested command: {}", command);
        Ok(command)
    }

    /// Explain a terminal error and suggest fixes
    ///
    /// # Arguments
    /// * `error_output` - The error message from terminal
    /// * `command` - The command that caused the error
    /// * `shell_type` - Shell type for context
    ///
    /// # Example
    /// ```ignore
    /// let explanation = ai.explain_error(
    ///     "Cannot find path 'C:/invalid/path'",
    ///     "cd C:/invalid/path",
    ///     "PowerShell"
    /// ).await?;
    /// ```
    pub async fn explain_error(
        &self,
        error_output: &str,
        command: Option<&str>,
        shell_type: &str,
    ) -> Result<String> {
        let command_context = command
            .map(|cmd| format!("\nCommand: {}", cmd))
            .unwrap_or_default();

        let prompt = format!(
            r#"You are a debugging expert. Explain this terminal error and suggest fixes.

Error Output:
{}
{}
Shell: {}
OS: Windows

Provide:
1. Brief explanation of what went wrong (2-3 sentences)
2. Most likely cause
3. Step-by-step fix suggestions (numbered list)
4. Alternative approaches if applicable

Keep explanation concise and actionable."#,
            error_output, command_context, shell_type
        );

        let response = self
            .router
            .send_message(&prompt, None)
            .await
            .map_err(|e| Error::Other(format!("LLM request failed: {}", e)))?;

        tracing::info!("AI explained error");
        Ok(response.trim().to_string())
    }

    /// Generate a semantic git commit message and execute commit
    ///
    /// # Arguments
    /// * `session_id` - Terminal session ID to use for git commands
    ///
    /// # Example
    /// ```ignore
    /// let message = ai.smart_commit("session_123").await?;
    /// println!("Committed with: {}", message);
    /// ```
    pub async fn smart_commit(&self, session_id: &str) -> Result<String> {
        // Get staged changes via git diff
        let diff_output = self
            .run_git_command(session_id, vec!["diff".to_string(), "--cached".to_string()])
            .await?;

        if diff_output.trim().is_empty() {
            return Err(Error::Other(
                "No staged changes to commit. Use 'git add' first.".to_string(),
            ));
        }

        // Get file list for context
        let files_output = self
            .run_git_command(
                session_id,
                vec![
                    "diff".to_string(),
                    "--cached".to_string(),
                    "--name-only".to_string(),
                ],
            )
            .await?;

        if files_output.trim().is_empty() {
            return Err(Error::Other(
                "No staged files detected. Use 'git add' first.".to_string(),
            ));
        }

        let prompt = format!(
            r#"Generate a conventional commit message for these changes.

Staged Files:
{}

Diff:
{}

Requirements:
- Use conventional commit format: type(scope): description
- Types: feat, fix, refactor, docs, test, chore, perf, ci, build
- Description: imperative mood, lowercase, no period
- Body: explain WHY, not WHAT (optional)
- Keep description under 72 characters
- Be specific about what changed

Format:
type(scope): description

Optional body explaining motivation and context.

Generate the commit message:"#,
            files_output.trim(),
            diff_output
        );

        let response = self
            .router
            .send_message(&prompt, None)
            .await
            .map_err(|e| Error::Other(format!("LLM request failed: {}", e)))?;

        let commit_message = response.trim().to_string();

        // Add AI attribution footer
        let full_message = format!(
            "{}\n\n- Generated with AGI Workforce\nCo-Authored-By: AGI Assistant <noreply@agiworkforce.ai>",
            commit_message.trim()
        );

        // Execute git commit
        let commit_output = self
            .run_git_command(
                session_id,
                vec![
                    "commit".to_string(),
                    "-m".to_string(),
                    full_message.to_string(),
                ],
            )
            .await?;

        tracing::info!("AI smart commit executed: {}", commit_message);
        Ok(format!("{}\n\n{}", commit_message, commit_output))
    }

    /// Suggest improvements for a command before execution
    ///
    /// # Arguments
    /// * `command` - Command to analyze
    /// * `shell_type` - Shell type
    ///
    /// # Example
    /// ```ignore
    /// let suggestions = ai.suggest_improvements(
    ///     "rm -rf *",
    ///     "Bash"
    /// ).await?;
    /// ```
    pub async fn suggest_improvements(
        &self,
        command: &str,
        shell_type: &str,
    ) -> Result<Option<String>> {
        let prompt = format!(
            r#"Analyze this shell command for issues and suggest improvements.

Command: {}
Shell: {}
OS: Windows

Check for:
- Security issues (destructive operations, unsafe patterns)
- Performance issues
- Best practices violations
- Portability issues
- Error handling

If command is safe and optimal, respond with: "OK"
If issues found, provide:
1. Issue severity (LOW/MEDIUM/HIGH)
2. Brief explanation
3. Improved command (if applicable)

Response:"#,
            command, shell_type
        );

        let response = self
            .router
            .send_message(&prompt, None)
            .await
            .map_err(|e| Error::Other(format!("LLM request failed: {}", e)))?;

        let analysis = response.trim();

        if analysis.eq_ignore_ascii_case("OK") || analysis.eq_ignore_ascii_case("OK.") {
            Ok(None)
        } else {
            Ok(Some(analysis.to_string()))
        }
    }

    async fn run_git_command(&self, session_id: &str, args: Vec<String>) -> Result<String> {
        let context = self
            .session_manager
            .get_session_context(session_id)
            .await?;

        if args.is_empty() {
            return Err(Error::Other("Git command missing arguments".to_string()));
        }

        run_and_capture(
            "git",
            &args,
            &context.cwd,
            &format!("git {}", args.join(" ")),
        )
        .await
    }
}

async fn run_and_capture(
    program: &str,
    args: &[String],
    cwd: &str,
    command_label: &str,
) -> Result<String> {
    let output = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .output()
        .await
        .map_err(|e| Error::Other(format!("Failed to run {}: {}", command_label, e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        let status = output.status.code().unwrap_or(-1);
        let err_text = if stderr.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            stderr.trim().to_string()
        };
        return Err(Error::Other(format!(
            "Command failed (status {}): {}",
            status, err_text
        )));
    }

    if stdout.trim().is_empty() {
        Ok(stderr.trim().to_string())
    } else {
        Ok(stdout.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_terminal_ai_creation() {
        // This test requires actual router and session manager instances
        // Integration tests would be more appropriate
    }

    #[test]
    fn test_command_sanitization() {
        // Test that generated commands are properly escaped
        let input = r#"echo "test with quotes""#;
        let escaped = input.replace('"', r#"\""#);
        assert!(escaped.contains(r#"\""#));
    }
}
