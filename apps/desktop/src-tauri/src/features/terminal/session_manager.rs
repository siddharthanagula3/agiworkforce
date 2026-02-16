use crate::features::terminal::{PtySession, ShellType};
use crate::sys::error::{Error, Result};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

// AUDIT-004-005 fix: Add maximum session limit to prevent unbounded memory growth
const MAX_SESSIONS: usize = 50;

#[derive(Clone, Debug)]
pub struct SessionContext {
    pub shell_type: ShellType,
    pub cwd: String,
}

#[derive(Clone)]
pub struct SessionManager {
    sessions: Arc<Mutex<HashMap<String, Arc<Mutex<PtySession>>>>>,
    app_handle: tauri::AppHandle,
}

impl SessionManager {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            app_handle,
        }
    }

    pub async fn create_session(
        &self,
        shell_type: ShellType,
        cwd: Option<String>,
    ) -> Result<String> {
        // AUDIT-004-005 fix: Check session count before creating new session
        {
            let sessions = self.sessions.lock().await;
            if sessions.len() >= MAX_SESSIONS {
                return Err(Error::Other(format!(
                    "Maximum number of terminal sessions ({}) reached. Please close some sessions first.",
                    MAX_SESSIONS
                )));
            }
        }

        let session = PtySession::new(shell_type, cwd)?;
        let session_id = session.id.clone();

        let session_arc = Arc::new(Mutex::new(session));
        self.sessions
            .lock()
            .await
            .insert(session_id.clone(), session_arc.clone());

        self.start_output_stream(session_id.clone(), session_arc)
            .await;

        tracing::info!("Created terminal session: {}", session_id);

        Ok(session_id)
    }

    pub async fn send_input(&self, session_id: &str, data: &str) -> Result<()> {
        let sessions = self.sessions.lock().await;

        if let Some(session_arc) = sessions.get(session_id) {
            let mut session = session_arc.lock().await;
            session.write(data)?;

            tracing::debug!("Sent input to session {}: {:?}", session_id, data);

            if data.ends_with('\n') || data.ends_with("\r\n") {
                let command = data.trim();
                if !command.is_empty() {
                    let session_id = session_id.to_string();
                    let command = command.to_string();
                    let app_handle = self.app_handle.clone();

                    tokio::spawn(async move {
                        if let Err(e) = log_command_to_db(&app_handle, &session_id, &command).await
                        {
                            tracing::error!("Failed to log command: {}", e);
                        }
                    });
                }
            }

            Ok(())
        } else {
            Err(Error::Other(format!("Session not found: {}", session_id)))
        }
    }

    pub async fn resize_session(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().await;

        if let Some(session_arc) = sessions.get(session_id) {
            let mut session = session_arc.lock().await;
            session.resize(cols, rows)?;
            tracing::debug!("Resized session {} to {}x{}", session_id, cols, rows);
            Ok(())
        } else {
            Err(Error::Other(format!("Session not found: {}", session_id)))
        }
    }

    pub async fn kill_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().await;

        if let Some(session_arc) = sessions.remove(session_id) {
            let mut session = session_arc.lock().await;
            session.kill()?;
            tracing::info!("Killed terminal session: {}", session_id);
            Ok(())
        } else {
            Err(Error::Other(format!("Session not found: {}", session_id)))
        }
    }

    pub async fn list_sessions(&self) -> Vec<String> {
        let sessions = self.sessions.lock().await;
        sessions.keys().cloned().collect()
    }

    pub async fn get_session_context(&self, session_id: &str) -> Result<SessionContext> {
        let sessions = self.sessions.lock().await;

        let session_arc = sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| Error::Other(format!("Session not found: {}", session_id)))?;

        drop(sessions);

        let session = session_arc.lock().await;
        Ok(SessionContext {
            shell_type: session.shell_type.clone(),
            cwd: session.cwd.clone(),
        })
    }

    /// Set an environment variable in the terminal session
    pub async fn set_env(&self, session_id: &str, key: &str, value: &str) -> Result<()> {
        let sessions = self.sessions.lock().await;

        let session_arc = sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| Error::Other(format!("Session not found: {}", session_id)))?;

        drop(sessions);

        let mut session = session_arc.lock().await;

        // Build the command based on shell type
        let command = match session.shell_type {
            ShellType::PowerShell => format!("$env:{}='{}'", key, value.replace("'", "''")),
            ShellType::Cmd => format!("set {}={}", key, value),
            _ => format!("export {}='{}'", key, value.replace("'", "\\'")),
        };

        session.execute_command(&command)?;
        tracing::debug!("Set environment variable {} in session {}", key, session_id);
        Ok(())
    }

    /// Get an environment variable from the terminal session
    pub async fn get_env(&self, session_id: &str, key: &str) -> Result<Option<String>> {
        let sessions = self.sessions.lock().await;

        let session_arc = sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| Error::Other(format!("Session not found: {}", session_id)))?;

        drop(sessions);

        let mut session = session_arc.lock().await;

        // Build the command based on shell type
        let command = match session.shell_type {
            ShellType::PowerShell => format!("echo $env:{}", key),
            ShellType::Cmd => format!("echo %{}%", key),
            _ => format!("echo ${}", key),
        };

        let output = session.execute_command(&command)?;

        // If output is empty, the variable is not set
        if output.trim().is_empty() {
            return Ok(None);
        }

        Ok(Some(output.trim().to_string()))
    }

    /// List all environment variables in the terminal session
    pub async fn list_env(&self, session_id: &str) -> Result<Vec<(String, String)>> {
        let sessions = self.sessions.lock().await;

        let session_arc = sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| Error::Other(format!("Session not found: {}", session_id)))?;

        drop(sessions);

        let mut session = session_arc.lock().await;

        // Use 'env' command to list all environment variables
        let output = session.execute_command("env")?;

        let mut env_vars = Vec::new();
        for line in output.lines() {
            if let Some((key, value)) = line.split_once('=') {
                if !key.is_empty() {
                    env_vars.push((key.to_string(), value.to_string()));
                }
            }
        }

        tracing::debug!(
            "Listed {} environment variables in session {}",
            env_vars.len(),
            session_id
        );
        Ok(env_vars)
    }

    /// Unset an environment variable in the terminal session
    pub async fn unset_env(&self, session_id: &str, key: &str) -> Result<()> {
        let sessions = self.sessions.lock().await;

        let session_arc = sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| Error::Other(format!("Session not found: {}", session_id)))?;

        drop(sessions);

        let mut session = session_arc.lock().await;

        // Build the command based on shell type
        let command = match session.shell_type {
            ShellType::PowerShell => format!("Remove-Item Env:{}", key),
            ShellType::Cmd => format!("set {}=", key),
            _ => format!("unset {}", key),
        };

        session.execute_command(&command)?;
        tracing::debug!(
            "Unset environment variable {} in session {}",
            key,
            session_id
        );
        Ok(())
    }

    /// Clear command history in the terminal session
    pub async fn clear_history(&self, session_id: &str) -> Result<()> {
        let sessions = self.sessions.lock().await;

        let session_arc = sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| Error::Other(format!("Session not found: {}", session_id)))?;

        drop(sessions);

        let mut session = session_arc.lock().await;

        // Clear bash/zsh history
        let command = match session.shell_type {
            ShellType::PowerShell => "Clear-History".to_string(),
            ShellType::Cmd => "doskey /HISTORY=".to_string(),
            ShellType::Fish => "history --clear".to_string(),
            _ => "history -c".to_string(), // bash, zsh, sh
        };

        session.execute_command(&command)?;
        tracing::debug!("Cleared command history in session {}", session_id);
        Ok(())
    }

    async fn start_output_stream(&self, session_id: String, session_arc: Arc<Mutex<PtySession>>) {
        let app_handle = self.app_handle.clone();
        let sessions = self.sessions.clone();

        tokio::spawn(async move {
            let mut buffer = vec![0u8; 4096];

            loop {
                {
                    let sessions_lock = sessions.lock().await;
                    if !sessions_lock.contains_key(&session_id) {
                        tracing::debug!("Session {} removed, stopping output stream", session_id);
                        break;
                    }
                }

                let (bytes_read, is_alive) = {
                    let mut session = session_arc.lock().await;

                    if !session.is_alive() {
                        tracing::info!("Session {} process exited", session_id);
                        (0, false)
                    } else {
                        match session.read_output(&mut buffer) {
                            Ok(n) => (n, true),
                            Err(e) => {
                                tracing::error!("Error reading from session {}: {}", session_id, e);
                                (0, false)
                            }
                        }
                    }
                };

                if !is_alive {
                    let _ = app_handle.emit(&format!("terminal-exit-{}", session_id), ());

                    // AUDIT-TERMINAL-032 fix: Remove session from backend when process exits
                    // This ensures backend state is consistent with frontend cleanup
                    let mut sessions_lock = sessions.lock().await;
                    sessions_lock.remove(&session_id);
                    tracing::info!(
                        "Cleaned up backend session {} after process exit",
                        session_id
                    );
                    break;
                }

                if bytes_read > 0 {
                    let output = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();

                    // AUDIT-TERMINAL-031 fix: Emit object format for consistent payload shape
                    // This matches the one-shot terminal command output format
                    let payload = serde_json::json!({
                        "stream": "stdout",
                        "data": output
                    });

                    if let Err(e) =
                        app_handle.emit(&format!("terminal-output-{}", session_id), &payload)
                    {
                        tracing::error!("Failed to emit terminal output: {}", e);
                        break;
                    }
                }

                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            }

            tracing::debug!("Output stream ended for session {}", session_id);
        });
    }
}

async fn log_command_to_db(
    app_handle: &tauri::AppHandle,
    session_id: &str,
    command: &str,
) -> Result<()> {
    use crate::sys::commands::AppDatabase;
    use rusqlite::params;

    let db_state = app_handle.state::<AppDatabase>();
    let conn = db_state
        .inner()
        .conn
        .lock()
        .map_err(|e| Error::Generic(format!("Database lock error: {}", e)))?;

    let working_dir = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string());

    let timestamp = chrono::Utc::now().to_rfc3339();

    // AUDIT-TERMINAL-029 fix: Include session_id to make history session-scoped
    conn.execute(
        "INSERT INTO command_history (command, working_dir, created_at, session_id) VALUES (?1, ?2, ?3, ?4)",
        params![command, working_dir, timestamp, session_id],
    )
    .map_err(|e| Error::Database(e.to_string()))?;

    tracing::debug!(
        "Logged command to database for session {}: {}",
        session_id,
        command
    );

    Ok(())
}

pub async fn get_command_history(
    app_handle: &tauri::AppHandle,
    session_id: &str,
    limit: usize,
) -> Result<Vec<String>> {
    use crate::sys::commands::AppDatabase;
    use rusqlite::params;

    let db_state = app_handle.state::<AppDatabase>();
    let conn = db_state
        .inner()
        .conn
        .lock()
        .map_err(|e| Error::Generic(format!("Database lock error: {}", e)))?;

    // AUDIT-TERMINAL-029 fix: Filter by session_id to make history session-scoped
    let mut stmt = conn
        .prepare("SELECT command FROM command_history WHERE session_id = ?1 ORDER BY created_at DESC LIMIT ?2")
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    let commands = stmt
        .query_map(params![session_id, limit], |row| row.get(0))
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?
        .collect::<std::result::Result<Vec<String>, _>>()
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    Ok(commands)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_context_structure() {
        // Test that SessionContext can be created with valid data
        let context = SessionContext {
            shell_type: ShellType::Bash,
            cwd: "/home/user".to_string(),
        };

        assert_eq!(context.cwd, "/home/user");
        // ShellType should have a sensible default
        let context_clone = context.clone();
        assert_eq!(context_clone.cwd, context.cwd);
    }

    #[test]
    fn test_session_context_clone() {
        let context = SessionContext {
            shell_type: ShellType::PowerShell,
            cwd: "/workspace/project".to_string(),
        };

        let cloned = context.clone();
        assert_eq!(cloned.cwd, context.cwd);
    }

    #[test]
    fn test_session_context_debug() {
        let context = SessionContext {
            shell_type: ShellType::Zsh,
            cwd: "/test".to_string(),
        };

        // Verify Debug trait is implemented
        let debug_str = format!("{:?}", context);
        assert!(debug_str.contains("SessionContext"));
        assert!(debug_str.contains("/test"));
    }

    // Note: Full SessionManager tests require a Tauri AppHandle which
    // cannot be created in unit tests. Integration tests should be used
    // for testing create_session, send_input, resize_session, etc.
    // See: apps/desktop/e2e/ for integration tests
}
