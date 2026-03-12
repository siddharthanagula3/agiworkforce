use crate::core::llm::LLMRouter;
use crate::features::terminal::SessionManager;
use crate::sys::error::{Error, Result};
use std::sync::Arc;
use tokio::process::Command;

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
            r#"You are AGI Workforce's terminal assistant. Generate a single, executable command for the following intent.

Intent: {}
Shell: {}
OS: {}{}

Requirements:
- Return ONLY the command, no explanations
- Use {} syntax
- Command must be safe and non-destructive
- Include error handling where appropriate
- Use modern best practices

Command:"#,
            intent,
            shell_type,
            std::env::consts::OS,
            cwd_context,
            shell_type
        );

        let response = self
            .router
            .send_message(&prompt, None)
            .await
            .map_err(|e| Error::Other(format!("LLM request failed: {}", e)))?;

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
            r#"You are AGI Workforce's debugging assistant. Explain this terminal error in plain English and suggest fixes.

Error Output:
{}
{}
Shell: {}
OS: {}

Provide:
1. Brief explanation of what went wrong (2-3 sentences)
2. Most likely cause
3. Step-by-step fix suggestions (numbered list)
4. Alternative approaches if applicable

Keep explanation concise and actionable."#,
            error_output,
            command_context,
            shell_type,
            std::env::consts::OS
        );

        let response = self
            .router
            .send_message(&prompt, None)
            .await
            .map_err(|e| Error::Other(format!("LLM request failed: {}", e)))?;

        tracing::info!("AI explained error");
        Ok(response.trim().to_string())
    }

    pub async fn smart_commit(&self, session_id: &str) -> Result<String> {
        let diff_output = self
            .run_git_command(session_id, vec!["diff".to_string(), "--cached".to_string()])
            .await?;

        if diff_output.trim().is_empty() {
            return Err(Error::Other(
                "No staged changes to commit. Use 'git add' first.".to_string(),
            ));
        }

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

        let full_message = format!(
            "{}\n\n- Generated with AGI Workforce\nCo-Authored-By: AGI Assistant <noreply@agiworkforce.ai>",
            commit_message.trim()
        );

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

    pub async fn suggest_improvements(
        &self,
        command: &str,
        shell_type: &str,
    ) -> Result<Option<String>> {
        let prompt = format!(
            r#"Analyze this shell command for issues and suggest improvements.

Command: {}
Shell: {}
OS: {}

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
            command,
            shell_type,
            std::env::consts::OS
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
        let context = self.session_manager.get_session_context(session_id).await?;

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
    #[test]
    fn test_command_sanitization() {
        let input = r#"echo "test with quotes""#;
        let escaped = input.replace('"', r#"\""#);
        assert!(escaped.contains(r#"\""#));
    }

    #[test]
    fn test_code_block_trimming() {
        // Test the command extraction logic used in suggest_command
        let response = "```bash\necho hello\n```";
        let command = response
            .trim()
            .trim_start_matches("```")
            .trim_start_matches("bash")
            .trim_end_matches("```")
            .trim();
        assert_eq!(command, "echo hello");
    }

    #[test]
    fn test_powershell_block_trimming() {
        let response = "```powershell\nGet-Process\n```";
        let command = response
            .trim()
            .trim_start_matches("```")
            .trim_start_matches("powershell")
            .trim_end_matches("```")
            .trim();
        assert_eq!(command, "Get-Process");
    }

    #[test]
    fn test_plain_command_response() {
        let response = "ls -la";
        let command = response
            .trim()
            .trim_start_matches("```")
            .trim_start_matches("bash")
            .trim_start_matches("sh")
            .trim_end_matches("```")
            .trim();
        assert_eq!(command, "ls -la");
    }

    #[test]
    fn test_ok_response_detection() {
        // Test the improvement suggestion logic
        let analysis = "OK";
        let is_ok = analysis.eq_ignore_ascii_case("OK") || analysis.eq_ignore_ascii_case("OK.");
        assert!(is_ok);

        let analysis = "ok.";
        let is_ok = analysis.eq_ignore_ascii_case("OK") || analysis.eq_ignore_ascii_case("OK.");
        assert!(is_ok);

        let analysis = "HIGH: Security issue found";
        let is_ok = analysis.eq_ignore_ascii_case("OK") || analysis.eq_ignore_ascii_case("OK.");
        assert!(!is_ok);
    }

    #[test]
    fn test_commit_message_format() {
        // Test the commit message formatting
        let commit_message = "feat(auth): add login validation";
        let full_message = format!(
            "{}\n\n- Generated with AGI Workforce\nCo-Authored-By: AGI Assistant <noreply@agiworkforce.ai>",
            commit_message.trim()
        );

        assert!(full_message.contains("feat(auth)"));
        assert!(full_message.contains("Generated with AGI Workforce"));
        assert!(full_message.contains("Co-Authored-By"));
    }

    // Note: Full TerminalAI tests require LLMRouter and SessionManager instances
    // which cannot be easily created in unit tests. The actual AI functionality
    // should be tested via integration tests.
}
