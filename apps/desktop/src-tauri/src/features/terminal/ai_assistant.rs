use crate::core::llm::{LLMRouter, RouterPreferences};
use crate::features::terminal::SessionManager;
use crate::sys::error::{Error, Result};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Terminal sessions are Local: prompts carry the working directory, error
/// output and staged diffs, so they never leave the device for a BYOK or
/// managed provider.
fn local_only() -> RouterPreferences {
    RouterPreferences {
        local_only: true,
        trust_mode: Some(agiworkforce_model_registry::TrustMode::Local),
        ..RouterPreferences::default()
    }
}

pub struct TerminalAI {
    router: Arc<RwLock<LLMRouter>>,
    session_manager: Arc<SessionManager>,
}

impl TerminalAI {
    pub fn new(router: Arc<RwLock<LLMRouter>>, session_manager: Arc<SessionManager>) -> Self {
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
            .read()
            .await
            .send_message(&prompt, Some(local_only()))
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
            .read()
            .await
            .send_message(&prompt, Some(local_only()))
            .await
            .map_err(|e| Error::Other(format!("LLM request failed: {}", e)))?;

        tracing::info!("AI explained error");
        Ok(response.trim().to_string())
    }

    /// Commit what is staged with a message the local model writes. Host git
    /// runs hardened, outside any sandbox, in a folder a sandboxed command
    /// may have written: the repository's settings are checked as for any
    /// desktop commit, no diff driver or submodule is read, and no commit
    /// hook runs, which the result says when the repository has any.
    pub async fn smart_commit(&self, session_id: &str) -> Result<String> {
        let cwd = self
            .session_manager
            .get_session_context(session_id)
            .await?
            .cwd;
        let checked = cwd.clone();
        tokio::task::spawn_blocking(move || {
            agiworkforce_worktree::config_guard::check_repository_config_blocking(
                std::path::Path::new(&checked),
                agiworkforce_worktree::config_guard::ConfigUse::COMMIT,
                false,
            )
        })
        .await
        .map_err(|e| Error::Other(format!("Failed to check the repository: {e}")))?
        .map_err(|error| Error::Other(crate::sys::commands::git::desktop_git_error(error)))?;

        let diff_output = run_git(&cwd, &STAGED_DIFF).await?;

        if diff_output.trim().is_empty() {
            return Err(Error::Other(
                "No staged changes to commit. Use 'git add' first.".to_string(),
            ));
        }

        let files_output = run_git(&cwd, &STAGED_NAMES).await?;

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
            .read()
            .await
            .send_message(&prompt, Some(local_only()))
            .await
            .map_err(|e| Error::Other(format!("LLM request failed: {}", e)))?;

        let commit_message = response.trim().to_string();

        let full_message = format!(
            "{}\n\n- Generated with AGI Workforce\nCo-Authored-By: AGI Assistant <noreply@agiworkforce.ai>",
            commit_message.trim()
        );

        let hooks_skipped = has_commit_hooks(&cwd).await;
        let commit_output = run_git(&cwd, &["commit", "-m", full_message.as_str()]).await?;

        tracing::info!("AI smart commit executed: {}", commit_message);
        let mut result = format!("{}\n\n{}", commit_message, commit_output);
        if hooks_skipped {
            result.push_str(
                "\n\nThe repository's commit hooks were not run. Run `git commit` yourself \
                 if they must check this commit.",
            );
        }
        Ok(result)
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
            .read()
            .await
            .send_message(&prompt, Some(local_only()))
            .await
            .map_err(|e| Error::Other(format!("LLM request failed: {}", e)))?;

        let analysis = response.trim();

        if analysis.eq_ignore_ascii_case("OK") || analysis.eq_ignore_ascii_case("OK.") {
            Ok(None)
        } else {
            Ok(Some(analysis.to_string()))
        }
    }
}

/// The staged patch, with no diff driver, text conversion or submodule read.
const STAGED_DIFF: [&str; 5] = [
    "diff",
    "--cached",
    "--no-ext-diff",
    "--no-textconv",
    "--ignore-submodules=dirty",
];
const STAGED_NAMES: [&str; 4] = [
    "diff",
    "--cached",
    "--name-only",
    "--ignore-submodules=dirty",
];

/// `git args` in `cwd` through hardened host git: no hooks, monitor,
/// editor or pager the repository names.
async fn run_git(cwd: &str, args: &[&str]) -> Result<String> {
    let label = format!("git {}", args.first().copied().unwrap_or_default());
    let mut command = agiworkforce_worktree::host_git_async();
    command.args(args).current_dir(cwd);
    let output = crate::sys::commands::git::host_git_output_async(command)
        .await
        .map_err(|e| Error::Other(format!("Failed to run {label}: {e}")))?;

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

/// Whether the user's own `git commit` here would run a hook: a runnable
/// file other than a sample in the hooks directory git resolves, or a hook
/// set in configuration. Read with the repository's hooks setting, so only
/// listing happens; nothing runs.
async fn has_commit_hooks(cwd: &str) -> bool {
    let read = |args: &'static [&'static str]| {
        let mut command = agiworkforce_worktree::host_git_keeping_hooks_async();
        command.args(args).current_dir(cwd);
        command
    };
    let configured = crate::sys::commands::git::host_git_output_async(read(&[
        "config",
        "--get-regexp",
        "^hook\\.",
    ]))
    .await
    .is_ok_and(|output| output.status.success() && !output.stdout.is_empty());
    if configured {
        return true;
    }
    let Ok(output) = crate::sys::commands::git::host_git_output_async(read(&[
        "rev-parse",
        "--path-format=absolute",
        "--git-path",
        "hooks",
    ]))
    .await
    else {
        return false;
    };
    let dir = std::path::PathBuf::from(String::from_utf8_lossy(&output.stdout).trim());
    std::fs::read_dir(dir).is_ok_and(|entries| {
        entries.flatten().any(|entry| {
            let path = entry.path();
            let sample = path
                .extension()
                .is_some_and(|extension| extension == "sample");
            !sample && runnable(&path)
        })
    })
}

fn runnable(path: &std::path::Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.is_file() && meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        meta.is_file()
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
