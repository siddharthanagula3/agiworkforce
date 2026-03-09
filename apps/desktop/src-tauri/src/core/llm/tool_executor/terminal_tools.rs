use super::*;

impl ToolExecutor {
    pub(crate) async fn execute_terminal_tool(
        &self,
        args: HashMap<String, serde_json::Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        use crate::features::terminal::{get_default_shell, ShellType};
        use crate::sys::security::command_validator::{validate_command, ValidationConfig};

        let command = args
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing command parameter"))?
            .to_string();
        // Use provided cwd, or fall back to project folder if set
        let cwd = args
            .get("cwd")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| self.project_folder.clone());
        // [H11] Security fix (supersedes AUDIT-TERMINAL-054): Always use system default shell.
        // The shell type must NOT be LLM-controllable — an LLM requesting
        // shell='wsl' could bypass bash-configured validator rules.
        // If multi-shell support is needed, it must be a user settings preference.
        let shell = match get_default_shell() {
            ShellType::PowerShell => "powershell",
            ShellType::Cmd => "cmd",
            ShellType::Zsh => "zsh",
            ShellType::Bash => "bash",
            ShellType::Fish => "fish",
            ShellType::Sh => "sh",
            ShellType::Wsl => "wsl",
            ShellType::GitBash => "gitbash",
        }
        .to_string();
        let timeout_ms = args
            .get("timeout_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(60_000);

        // Validate command using centralized validator (one-shot mode)
        let validation = ValidationConfig::oneshot().with_correlation_id(tool_id);
        if let Err(e) = validate_command(&command, &validation) {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::new(),
            });
        }

        // Emit progress: starting command
        if let Some(app_handle) = &self.app_handle {
            emit_tool_progress(
                app_handle,
                tool_id,
                0.1,
                Some(&format!("Running: {}", &command[..command.len().min(50)])),
            );
        }

        if let Some(dir) = &cwd {
            if let Err(e) = self.validate_path(dir).await {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": e.to_string(), "success": false }),
                    error: Some(e.to_string()),
                    metadata: HashMap::new(),
                });
            }
        }

        // AUDIT-TERMINAL-065/068 fix: Proper shell routing that honors requested shell
        // and doesn't select powershell.exe on non-Windows for unknown shells
        let (program, mut shell_args): (String, Vec<String>) = match shell.as_str() {
            "cmd" => (
                "cmd.exe".to_string(),
                vec!["/C".to_string(), command.clone()],
            ),
            "bash" => ("bash".to_string(), vec!["-lc".to_string(), command.clone()]),
            "zsh" => ("zsh".to_string(), vec!["-lc".to_string(), command.clone()]),
            "fish" => ("fish".to_string(), vec!["-c".to_string(), command.clone()]),
            "sh" => ("sh".to_string(), vec!["-c".to_string(), command.clone()]),
            "wsl" => (
                "wsl.exe".to_string(),
                vec!["bash".to_string(), "-lc".to_string(), command.clone()],
            ),
            "gitbash" => {
                // On Windows, resolve the full Git Bash path so the process does not depend
                // on bash.exe being on %PATH% (which is not guaranteed for Git Bash installs).
                // On non-Windows, Git Bash doesn't exist; fall back to plain bash.
                #[cfg(target_os = "windows")]
                {
                    let git_bash_paths = [
                        "C:\\Program Files\\Git\\bin\\bash.exe",
                        "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
                    ];
                    let program = git_bash_paths
                        .iter()
                        .find(|p| std::path::Path::new(p).exists())
                        .map(|p| p.to_string())
                        .unwrap_or_else(|| "bash".to_string());
                    (program, vec!["-lc".to_string(), command.clone()])
                }
                #[cfg(not(target_os = "windows"))]
                {
                    // Git Bash is Windows-specific; fall back to bash on non-Windows
                    ("bash".to_string(), vec!["-lc".to_string(), command.clone()])
                }
            }
            "powershell" | "pwsh" => {
                if cfg!(target_os = "windows") {
                    (
                        "powershell.exe".to_string(),
                        vec![
                            "-NoLogo".to_string(),
                            "-NoProfile".to_string(),
                            "-Command".to_string(),
                            command.clone(),
                        ],
                    )
                } else {
                    (
                        "pwsh".to_string(),
                        vec![
                            "-NoLogo".to_string(),
                            "-NoProfile".to_string(),
                            "-Command".to_string(),
                            command.clone(),
                        ],
                    )
                }
            }
            _ => {
                // AUDIT-TERMINAL-068 fix: Don't silently fall back to powershell.exe
                // Use system default shell for unknown shells instead
                let default_shell_type = get_default_shell();
                match default_shell_type {
                    ShellType::PowerShell => {
                        if cfg!(target_os = "windows") {
                            (
                                "powershell.exe".to_string(),
                                vec![
                                    "-NoLogo".to_string(),
                                    "-NoProfile".to_string(),
                                    "-Command".to_string(),
                                    command.clone(),
                                ],
                            )
                        } else {
                            (
                                "pwsh".to_string(),
                                vec![
                                    "-NoLogo".to_string(),
                                    "-NoProfile".to_string(),
                                    "-Command".to_string(),
                                    command.clone(),
                                ],
                            )
                        }
                    }
                    ShellType::Bash => {
                        ("bash".to_string(), vec!["-lc".to_string(), command.clone()])
                    }
                    ShellType::Zsh => ("zsh".to_string(), vec!["-lc".to_string(), command.clone()]),
                    ShellType::Fish => {
                        ("fish".to_string(), vec!["-c".to_string(), command.clone()])
                    }
                    ShellType::Sh => ("sh".to_string(), vec!["-c".to_string(), command.clone()]),
                    ShellType::Cmd => (
                        "cmd.exe".to_string(),
                        vec!["/C".to_string(), command.clone()],
                    ),
                    ShellType::Wsl => (
                        "wsl.exe".to_string(),
                        vec!["bash".to_string(), "-lc".to_string(), command.clone()],
                    ),
                    ShellType::GitBash => {
                        #[cfg(target_os = "windows")]
                        {
                            let git_bash_paths = [
                                "C:\\Program Files\\Git\\bin\\bash.exe",
                                "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
                            ];
                            let program = git_bash_paths
                                .iter()
                                .find(|p| std::path::Path::new(p).exists())
                                .map(|p| p.to_string())
                                .unwrap_or_else(|| "bash".to_string());
                            (program, vec!["-lc".to_string(), command.clone()])
                        }
                        #[cfg(not(target_os = "windows"))]
                        {
                            ("bash".to_string(), vec!["-lc".to_string(), command.clone()])
                        }
                    }
                }
            }
        };

        let mut cmd = Command::new(&program);
        for arg in shell_args.drain(..) {
            cmd.arg(arg);
        }
        if let Some(dir) = &cwd {
            cmd.current_dir(dir);
        }
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        cmd.kill_on_drop(true);

        // Emit progress: process spawned
        if let Some(app_handle) = &self.app_handle {
            emit_tool_progress(app_handle, tool_id, 0.3, Some("Process started"));
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn shell: {}", e))?;
        let stdout_handle = child.stdout.take();
        let stderr_handle = child.stderr.take();

        let stdout_app_handle = self.app_handle.clone();
        let stdout_tool_id = tool_id.to_string();
        let stdout_task = tokio::spawn(async move {
            let mut collected = Vec::new();
            if let Some(mut stdout) = stdout_handle {
                let mut chunk = vec![0u8; 1024];
                loop {
                    let read = stdout.read(&mut chunk).await?;
                    if read == 0 {
                        break;
                    }
                    collected.extend_from_slice(&chunk[..read]);
                    if let Some(app_handle) = &stdout_app_handle {
                        let text = String::from_utf8_lossy(&chunk[..read]).to_string();
                        if !text.is_empty() {
                            emit_tool_output_chunk(
                                app_handle,
                                &stdout_tool_id,
                                &text,
                                OutputChunkType::Stdout,
                                false,
                            );
                        }
                    }
                }
            }
            Ok::<Vec<u8>, std::io::Error>(collected)
        });

        let stderr_app_handle = self.app_handle.clone();
        let stderr_tool_id = tool_id.to_string();
        let stderr_task = tokio::spawn(async move {
            let mut collected = Vec::new();
            if let Some(mut stderr) = stderr_handle {
                let mut chunk = vec![0u8; 1024];
                loop {
                    let read = stderr.read(&mut chunk).await?;
                    if read == 0 {
                        break;
                    }
                    collected.extend_from_slice(&chunk[..read]);
                    if let Some(app_handle) = &stderr_app_handle {
                        let text = String::from_utf8_lossy(&chunk[..read]).to_string();
                        if !text.is_empty() {
                            emit_tool_output_chunk(
                                app_handle,
                                &stderr_tool_id,
                                &text,
                                OutputChunkType::Stderr,
                                false,
                            );
                        }
                    }
                }
            }
            Ok::<Vec<u8>, std::io::Error>(collected)
        });

        let start = Instant::now();
        let status = match timeout(TokioDuration::from_millis(timeout_ms), child.wait()).await {
            Ok(result) => result.map_err(|e| anyhow!("Failed to wait for command: {}", e))?,
            Err(_) => {
                let timeout_error = format!("Command timed out after {} ms", timeout_ms);

                if let Err(e) = child.kill().await {
                    tracing::warn!("Failed to kill timed-out process: {}", e);
                }

                match timeout(TokioDuration::from_millis(1000), child.wait()).await {
                    Ok(Ok(_status)) => {
                        tracing::debug!("Process terminated gracefully after timeout");
                    }
                    Ok(Err(e)) => {
                        tracing::warn!("Error waiting for process termination: {}", e);
                    }
                    Err(_) => {
                        tracing::warn!(
                            "Process did not terminate gracefully, will be force-killed"
                        );
                    }
                }

                stdout_task.abort();
                stderr_task.abort();

                if let Some(app_handle) = &self.app_handle {
                    let terminal_event = TerminalCommand {
                        id: Uuid::new_v4().to_string(),
                        command: command.clone(),
                        cwd: cwd.clone().unwrap_or_else(|| ".".to_string()),
                        exit_code: None,
                        stdout: None,
                        stderr: Some(timeout_error.clone()),
                        duration: Some(timeout_ms),
                        session_id: None,
                        agent_id: None,
                    };
                    emit_terminal_command(app_handle, terminal_event);
                }
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": timeout_error.clone(), "success": false }),
                    error: Some(timeout_error),
                    metadata: HashMap::new(),
                });
            }
        };

        let stdout = stdout_task
            .await
            .map_err(|e| anyhow!("Failed to join stdout reader: {}", e))?
            .map_err(|e| anyhow!("Failed to read stdout: {}", e))?;
        let stderr = stderr_task
            .await
            .map_err(|e| anyhow!("Failed to join stderr reader: {}", e))?
            .map_err(|e| anyhow!("Failed to read stderr: {}", e))?;
        let output = std::process::Output {
            status,
            stdout,
            stderr,
        };

        let duration_ms = start.elapsed().as_millis() as u64;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code();
        let success = output.status.success();

        // Emit progress: command completed, processing output
        if let Some(app_handle) = &self.app_handle {
            emit_tool_progress(app_handle, tool_id, 0.8, Some("Processing output..."));
        }

        if let Some(app_handle) = &self.app_handle {
            let terminal_event = TerminalCommand {
                id: Uuid::new_v4().to_string(),
                command: command.clone(),
                cwd: cwd.clone().unwrap_or_else(|| ".".to_string()),
                exit_code,
                stdout: if stdout.is_empty() {
                    None
                } else {
                    Some(stdout.clone())
                },
                stderr: if stderr.is_empty() {
                    None
                } else {
                    Some(stderr.clone())
                },
                duration: Some(duration_ms),
                session_id: None,
                agent_id: None,
            };
            emit_terminal_command(app_handle, terminal_event);

            // Final progress update
            emit_tool_progress(app_handle, tool_id, 1.0, Some("Complete"));
        }

        let mut metadata = HashMap::new();
        metadata.insert("shell".to_string(), json!(shell));
        metadata.insert("program".to_string(), json!(program));
        if let Some(dir) = &cwd {
            metadata.insert("cwd".to_string(), json!(dir));
        }

        let error_message = if success {
            None
        } else {
            let trimmed = stderr.trim();
            if trimmed.is_empty() {
                Some(match exit_code {
                    Some(code) => format!("Command exited with code {}", code),
                    None => "Command exited with error".to_string(),
                })
            } else {
                Some(trimmed.to_string())
            }
        };

        // Record terminal command execution for undo tracking (non-reversible but tracked)
        if success {
            if let Some(app_handle) = &self.app_handle {
                if let Some(undo_state) = app_handle.try_state::<UndoState>() {
                    let task_id = Uuid::new_v4().to_string();
                    let working_dir = cwd.clone().unwrap_or_else(|| ".".to_string());
                    let _ = undo_state
                        .change_tracker
                        .record_tool_executed(
                            "terminal_execute".to_string(),
                            json!({ "command": command, "cwd": working_dir, "shell": shell }),
                            json!({
                                "stdout": &stdout,
                                "stderr": &stderr,
                                "exitCode": exit_code,
                                "durationMs": duration_ms,
                            }),
                            task_id,
                            None, // Terminal commands are not automatically reversible
                            None,
                            None,
                        )
                        .await;
                }
            }
        }

        Ok(ToolResult {
            success,
            data: json!({
                "command": command,
                "stdout": stdout,
                "stderr": stderr,
                "exitCode": exit_code,
                "durationMs": duration_ms,
            }),
            error: error_message,
            metadata,
        })
    }

    pub(crate) async fn execute_code_execute_tool(&self, args: &HashMap<String, Value>) -> Result<ToolResult> {
        let language = args
            .get("language")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing language parameter"))?;
        let code = args
            .get("code")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing code parameter"))?;

        if let Some(ref app) = self.app_handle {
            use crate::features::terminal::{SessionManager, ShellType};
            use tauri::Manager;

            let session_manager = app.state::<SessionManager>();

            let shell_type = match language.to_lowercase().as_str() {
                "powershell" | "ps1" => ShellType::PowerShell,
                // On Windows, WSL may not be installed; fall back to the system default shell
                // (PowerShell or Cmd) so bash/sh code snippets still execute rather than fail.
                // On non-Windows the system default shell will be bash/zsh/sh as expected.
                "bash" | "sh" | "shell" => {
                    #[cfg(target_os = "windows")]
                    {
                        use crate::features::terminal::get_default_shell;
                        get_default_shell()
                    }
                    #[cfg(not(target_os = "windows"))]
                    ShellType::Wsl
                }
                "cmd" | "batch" => ShellType::Cmd,
                _ => ShellType::PowerShell,
            };

            let session_id = match session_manager.create_session(shell_type, None).await {
                Ok(sid) => sid,
                Err(e) => {
                    let err_msg = format!("Failed to create session: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match session_manager
                .send_input(&session_id, &format!("{}\n", code))
                .await
            {
                Ok(_) => {
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    Ok(ToolResult {
                        success: true,
                        data: json!({ "success": true, "session_id": session_id, "code": code }),
                        error: None,
                        metadata: HashMap::from([("session_id".to_string(), json!(session_id))]),
                    })
                }
                Err(e) => {
                    let err_msg = format!("Failed to execute code: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            let err_msg = "App handle not available for code execution".to_string();
            Ok(ToolResult {
                success: false,
                data: json!({ "error": err_msg.clone(), "success": false }),
                error: Some(err_msg),
                metadata: HashMap::new(),
            })
        }
    }

    /// Execute the `test_run` tool: auto-detect the test runner and invoke it.
    pub(crate) async fn execute_test_run_tool(
        &self,
        args: HashMap<String, serde_json::Value>,
        action_id: &str,
    ) -> Result<ToolResult> {
        let project_root = args
            .get("project_root")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| self.project_folder.clone())
            .unwrap_or_else(|| ".".to_string());

        let runner = args
            .get("runner")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let filter = args
            .get("filter")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let timeout_secs = args
            .get("timeout_secs")
            .and_then(|v| v.as_u64())
            .unwrap_or(120);

        let root = std::path::Path::new(&project_root);

        // Determine runner (explicit or auto-detect)
        let detected_runner = if let Some(r) = runner {
            r
        } else if root.join("Cargo.toml").exists() {
            "cargo".to_string()
        } else if root.join("pytest.ini").exists()
            || root.join("setup.py").exists()
            || root.join("pyproject.toml").exists()
        {
            "pytest".to_string()
        } else if root.join("jest.config.js").exists()
            || root.join("jest.config.ts").exists()
            || root.join("jest.config.cjs").exists()
        {
            "jest".to_string()
        } else if root.join("vitest.config.ts").exists()
            || root.join("vitest.config.js").exists()
        {
            "vitest".to_string()
        } else if root.join("go.mod").exists() {
            "go".to_string()
        } else if root.join("Gemfile").exists() {
            "rspec".to_string()
        } else if root.join("bun.lockb").exists() || root.join("bunfig.toml").exists() {
            "bun".to_string()
        } else if root.join("package.json").exists() {
            "jest".to_string()
        } else {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": "Could not auto-detect test runner", "success": false }),
                error: Some("Could not auto-detect test runner".to_string()),
                metadata: HashMap::new(),
            });
        };

        // Build the command
        let command = match detected_runner.as_str() {
            "cargo" => match &filter {
                Some(f) => format!("cargo test {f}"),
                None => "cargo test".to_string(),
            },
            "pytest" => match &filter {
                Some(f) => format!("pytest -v -k {f}"),
                None => "pytest -v".to_string(),
            },
            "jest" => match &filter {
                Some(f) => format!("npx jest --verbose {f}"),
                None => "npx jest --verbose".to_string(),
            },
            "vitest" => match &filter {
                Some(f) => format!("npx vitest run {f}"),
                None => "npx vitest run".to_string(),
            },
            "go" => match &filter {
                Some(f) => format!("go test -v -run {f} ./..."),
                None => "go test -v ./...".to_string(),
            },
            "rspec" => match &filter {
                Some(f) => format!("bundle exec rspec {f}"),
                None => "bundle exec rspec".to_string(),
            },
            "bun" => match &filter {
                Some(f) => format!("bun test {f}"),
                None => "bun test".to_string(),
            },
            other => {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Unknown test runner: {other}"), "success": false }),
                    error: Some(format!("Unknown test runner: {other}")),
                    metadata: HashMap::new(),
                });
            }
        };

        // Delegate to terminal execution
        let mut terminal_args = HashMap::new();
        terminal_args.insert("command".to_string(), json!(command));
        terminal_args.insert("cwd".to_string(), json!(project_root));
        terminal_args.insert("timeout_ms".to_string(), json!(timeout_secs * 1000));

        self.execute_terminal_tool(terminal_args, action_id).await
    }

    pub(crate) async fn execute_code_analyze_tool(&self, args: &HashMap<String, Value>) -> Result<ToolResult> {
        let code = args
            .get("code")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing code parameter"))?;
        let language = args
            .get("language")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        let line_count = code.lines().count();
        let char_count = code.len();
        let non_whitespace = code.chars().filter(|c| !c.is_whitespace()).count();

        Ok(ToolResult {
            success: true,
            data: json!({
                "language": language,
                "line_count": line_count,
                "char_count": char_count,
                "non_whitespace_chars": non_whitespace,
                "analysis": "Basic static analysis complete"
            }),
            error: None,
            metadata: HashMap::from([("language".to_string(), json!(language))]),
        })
    }
}
