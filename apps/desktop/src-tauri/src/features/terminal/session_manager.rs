use crate::features::terminal::{PtySession, ShellType};
use crate::sys::error::{Error, Result};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

// Add maximum session limit to prevent unbounded memory growth
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

            // Every keystroke line reaches this log, including a password typed
            // at an interactive prompt, and the rolling log file it lands in is
            // collected verbatim into support bundles (sys/support_bundle.rs).
            tracing::debug!(
                "Sent input to session {}: {:?}",
                session_id,
                crate::sys::security::log_redaction::redact_secrets(data)
            );

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

    pub async fn live_session_count(&self) -> usize {
        let sessions = self.sessions.lock().await;
        let mut live = 0;
        for session in sessions.values() {
            if session.lock().await.is_alive() {
                live += 1;
            }
        }
        live
    }

    pub async fn kill_all_trees(&self) -> usize {
        let drained: Vec<(String, Arc<Mutex<PtySession>>)> =
            self.sessions.lock().await.drain().collect();
        let mut killed = 0;
        for (session_id, session) in drained {
            match session.lock().await.kill_tree() {
                Ok(()) => killed += 1,
                Err(error) => {
                    tracing::warn!("Failed to end terminal session {session_id}: {error}");
                }
            }
        }
        killed
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

                    // Remove session from backend when process exits
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

                    // Emit object format for consistent payload shape
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

/// Scrub potential secrets from a command string before storing in DB.
/// Masks values matching common secret patterns (PASSWORD=xxx, --password xxx,
/// export SECRET=xxx, API_KEY=xxx, TOKEN=xxx, auth headers, `-u user:pass`,
/// attached short flags like `-pSECRET`, and credentials embedded in URLs).
///
/// This is best-effort. It cannot recognise a bare pasted token, and it cannot
/// recognise a password typed at an interactive prompt at all -- `send_input`
/// logs every line the user enters and a typed password has no shape to match.
/// The scrubber is therefore not the containment boundary: keeping
/// `command_history` off the LLM db_query allowlist
/// (core/llm/tool_executor/db_tools.rs) is what stops this text reaching a
/// provider.
pub(crate) fn scrub_secrets(command: &str) -> String {
    use once_cell::sync::Lazy;
    use regex::Regex;

    // Pattern: KEY=VALUE where KEY looks like a secret name
    // Matches: PASSWORD=abc, API_KEY="abc", export SECRET_TOKEN='abc'
    // Note: Rust regex doesn't support backreferences, so we match quoted
    // and unquoted values without requiring matching quote pairs.
    static SECRET_ASSIGN: Lazy<Regex> = Lazy::new(|| {
        Regex::new(
            r#"(?i)((?:export\s+)?(?:\w*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|CREDENTIALS?|AUTH)\w*))\s*=\s*['"]?([^\s'"]+)['"]?"#,
        )
        .expect("invalid regex")
    });

    // Pattern: --password VALUE or --token VALUE (common CLI flags)
    static FLAG_SECRET: Lazy<Regex> = Lazy::new(|| {
        Regex::new(
            r#"(?i)(--?(?:password|passwd|token|secret|api[_-]?key|auth))\s+['"]?([^\s'"]+)['"]?"#,
        )
        .expect("invalid regex")
    });

    // `-H "Authorization: Bearer ..."`, `-H 'X-Api-Key: ...'` and friends.
    static HEADER_SECRET: Lazy<Regex> = Lazy::new(|| {
        Regex::new(
            r#"(?i)\b(authorization|proxy-authorization|x-api-key|api-key|x-auth-token|cookie|set-cookie)(\s*:\s*)[^"'\r\n]+"#,
        )
        .expect("invalid regex")
    });

    // `curl -u user:pass` / `--user user:pass`: keep the user, drop the secret.
    static USERINFO_FLAG: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r#"(?i)(^|\s)(--user|-u)(\s+['"]?)([^\s:'"]+):([^\s'"]*)"#)
            .expect("invalid regex")
    });

    // Attached short flags with no separator: `mysql -pSECRET`, `-uroot`.
    static ATTACHED_SHORT_FLAG: Lazy<Regex> =
        Lazy::new(|| Regex::new(r#"(?i)(^|\s)(-[pu])([^\s'"=-][^\s'"]*)"#).expect("invalid regex"));

    // Credentials in a URL: https://user:TOKEN@host, https://TOKEN@host.
    static URL_USERINFO_PAIR: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r#"(?i)([a-z][a-z0-9+.\-]*://)([^\s:/@'"]+):([^\s/@'"]+)@"#)
            .expect("invalid regex")
    });
    static URL_USERINFO_SINGLE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r#"(?i)([a-z][a-z0-9+.\-]*://)([^\s:/@'"]+)@"#).expect("invalid regex")
    });

    let scrubbed = SECRET_ASSIGN.replace_all(command, "$1=****");
    let scrubbed = FLAG_SECRET.replace_all(&scrubbed, "$1 ****");
    let scrubbed = HEADER_SECRET.replace_all(&scrubbed, "${1}${2}****");
    let scrubbed = USERINFO_FLAG.replace_all(&scrubbed, "${1}${2}${3}${4}:****");
    let scrubbed = ATTACHED_SHORT_FLAG.replace_all(&scrubbed, |caps: &regex::Captures| {
        let value = &caps[3];
        // A port or other all-numeric argument (`-p8080`, `-p 2222`) is not a
        // credential; masking it would bury useful history for no gain.
        if value.chars().all(|c| c.is_ascii_digit() || c == ':') {
            caps[0].to_string()
        } else {
            format!("{}{}****", &caps[1], &caps[2])
        }
    });
    let scrubbed = URL_USERINFO_PAIR.replace_all(&scrubbed, "${1}${2}:****@");
    let scrubbed = URL_USERINFO_SINGLE.replace_all(&scrubbed, "${1}****@");
    scrubbed.into_owned()
}

/// Re-mask stored history rows the current scrubber would catch.
///
/// Scrubbing on write only protects rows written after the scrubber learned a
/// shape. Header, `-u user:pass`, attached short-flag and URL credentials typed
/// before that are still on disk in cleartext, where anything running as the
/// user reads them straight out of the sqlite file, masking them on the way out
/// of `get_command_history` keeps them off the wire but leaves the file. This
/// rewrites the stored text instead, and is idempotent: a row already equal to
/// its scrubbed form is not touched.
pub(crate) fn rescrub_stored_history(conn: &rusqlite::Connection) -> rusqlite::Result<usize> {
    use rusqlite::params;

    let stale: Vec<(i64, String)> = {
        let mut stmt = conn.prepare("SELECT id, command FROM command_history")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?;
        rows.filter_map(|row| row.ok())
            .filter_map(|(id, command)| {
                let scrubbed = scrub_secrets(&command);
                (scrubbed != command).then_some((id, scrubbed))
            })
            .collect()
    };

    for (id, scrubbed) in &stale {
        conn.execute(
            "UPDATE command_history SET command = ?1 WHERE id = ?2",
            params![scrubbed, id],
        )?;
    }

    Ok(stale.len())
}

fn rescrub_stored_history_once(conn: &rusqlite::Connection) {
    static RESCRUB: std::sync::Once = std::sync::Once::new();

    RESCRUB.call_once(|| match rescrub_stored_history(conn) {
        Ok(0) => {}
        Ok(rewritten) => tracing::info!(
            "Masked credentials in {} stored terminal history rows",
            rewritten
        ),
        Err(e) => tracing::warn!("Could not re-scrub stored terminal history: {}", e),
    });
}

async fn log_command_to_db(
    app_handle: &tauri::AppHandle,
    session_id: &str,
    command: &str,
) -> Result<()> {
    use crate::sys::commands::AppDatabase;
    use rusqlite::params;

    // Scrub potential secrets before persisting to DB
    let sanitized_command = scrub_secrets(command);

    let db_state = app_handle.state::<AppDatabase>();
    let conn = db_state
        .inner()
        .conn
        .lock()
        .map_err(|e| Error::Generic(format!("Database lock error: {}", e)))?;

    rescrub_stored_history_once(&conn);

    let working_dir = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string());

    let timestamp = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO command_history (command, working_dir, created_at, session_id) VALUES (?1, ?2, ?3, ?4)",
        params![sanitized_command, working_dir, timestamp, session_id],
    )
    .map_err(|e| Error::Database(e.to_string()))?;

    tracing::debug!(
        "Logged command to database for session {}: {}",
        session_id,
        sanitized_command
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

    rescrub_stored_history_once(&conn);

    let mut stmt = conn
        .prepare("SELECT command FROM command_history WHERE session_id = ?1 ORDER BY created_at DESC LIMIT ?2")
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    let commands = stmt
        .query_map(params![session_id, limit as i64], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?
        .collect::<std::result::Result<Vec<String>, _>>()
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    // `rescrub_stored_history_once` has already rewritten what the scrubber can
    // mask; this covers a row inserted by another process between that pass and
    // this read.
    Ok(commands.iter().map(|c| scrub_secrets(c)).collect())
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

    #[test]
    fn test_scrub_secrets_password_assignment() {
        assert_eq!(
            scrub_secrets("export PASSWORD=mysecret123"),
            "export PASSWORD=****"
        );
        assert_eq!(
            scrub_secrets("DB_PASSWORD=hunter2 other_arg"),
            "DB_PASSWORD=**** other_arg"
        );
    }

    #[test]
    fn test_scrub_secrets_api_key() {
        assert_eq!(
            scrub_secrets("API_KEY=sk-abc123 --verbose"),
            "API_KEY=**** --verbose"
        );
        assert_eq!(scrub_secrets("MY_AUTH_TOKEN=tok_xyz"), "MY_AUTH_TOKEN=****");
    }

    #[test]
    fn test_scrub_secrets_flag_style() {
        assert_eq!(
            scrub_secrets("mysql --password supersecret -h localhost"),
            "mysql --password **** -h localhost"
        );
        assert_eq!(
            scrub_secrets("curl -H --token bearer_abc123"),
            "curl -H --token ****"
        );
    }

    #[test]
    fn test_scrub_secrets_no_false_positives() {
        // Normal commands should not be scrubbed
        let normal = "ls -la /home/user";
        assert_eq!(scrub_secrets(normal), normal);

        let git = "git commit -m 'fix auth flow'";
        assert_eq!(scrub_secrets(git), git);
    }

    // Note: Full SessionManager tests require a Tauri AppHandle which
    // cannot be created in unit tests. Integration tests should be used
    // for testing create_session, send_input, resize_session, etc.
    // See: apps/desktop/e2e/ for integration tests
}
