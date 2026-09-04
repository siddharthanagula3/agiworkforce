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

const MAX_ENV_KEY_LEN: usize = 256;

pub fn validate_env_key(key: &str) -> Result<()> {
    let mut chars = key.chars();
    let shape_ok = matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_');
    if !shape_ok || key.len() > MAX_ENV_KEY_LEN {
        return Err(Error::Other(format!(
            "Invalid environment variable name {:?}: names must match [A-Za-z_][A-Za-z0-9_]*",
            key
        )));
    }
    Ok(())
}

/// The rendered assignment is typed into a LIVE line editor, so a value's bytes
/// are consumed by readline/PSReadLine as keystrokes before any shell parser
/// sees them, and quoting cannot reach them. Control bytes are editing commands
/// there: `\x18\x05` is readline's `edit-and-execute-command`, which hands the
/// rest of the value to $EDITOR as keystrokes and then EXECUTES the edited
/// buffer, with no newline anywhere in the value. Bytes above ASCII are no
/// safer -- with `convert-meta` on (readline's default whenever the locale is
/// not 8-bit clean, which is what a GUI app inherits when it is launched
/// without LANG) each one arrives as ESC + byte and reaches meta bindings such
/// as `shell-expand-line`, which performs command substitution. Printable ASCII
/// is the only alphabet that self-inserts under every one of those settings.
pub fn validate_env_value(value: &str) -> Result<()> {
    if let Some(rejected) = value.chars().find(|c| !matches!(c, ' '..='~')) {
        return Err(Error::Other(format!(
            "Invalid environment variable value: {:?} is not printable ASCII, and the terminal's line editor would read it as a keystroke rather than text",
            rejected
        )));
    }
    Ok(())
}

fn posix_single_quote(value: &str) -> String {
    // Backslash does not escape inside POSIX single quotes; the only way to emit
    // one is to close the quote, add an escaped quote, and reopen.
    value.replace('\'', r#"'"'"'"#)
}

pub fn set_env_command(shell_type: &ShellType, key: &str, value: &str) -> Result<String> {
    validate_env_key(key)?;
    validate_env_value(value)?;

    Ok(match shell_type {
        ShellType::PowerShell => format!("$env:{}='{}'", key, value.replace('\'', "''")),
        ShellType::Cmd => {
            // cmd.exe offers no escape that survives inside `set`: a quote ends the
            // quoted assignment and %VAR% / !VAR! re-expand into command position,
            // so such values are refused rather than quoted.
            if value.contains(['"', '%', '!']) {
                return Err(Error::Other(
                    "Environment variable values containing \", % or ! are not supported on cmd.exe"
                        .to_string(),
                ));
            }
            format!("set \"{}={}\"", key, value)
        }
        // Fish is the one shell here whose single quotes honour backslash
        // escapes, so the POSIX form leaves `export FOO='C:\'` unterminated and
        // hangs the prompt on a continuation.
        ShellType::Fish => format!(
            "export {}='{}'",
            key,
            value.replace('\\', r"\\").replace('\'', r"\'")
        ),
        _ => format!("export {}='{}'", key, posix_single_quote(value)),
    })
}

pub fn get_env_command(shell_type: &ShellType, key: &str) -> Result<String> {
    validate_env_key(key)?;

    Ok(match shell_type {
        ShellType::PowerShell => format!("echo $env:{}", key),
        ShellType::Cmd => format!("echo %{}%", key),
        _ => format!("echo ${}", key),
    })
}

pub fn unset_env_command(shell_type: &ShellType, key: &str) -> Result<String> {
    validate_env_key(key)?;

    Ok(match shell_type {
        ShellType::PowerShell => format!("Remove-Item Env:{}", key),
        ShellType::Cmd => format!("set {}=", key),
        _ => format!("unset {}", key),
    })
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

        let command = set_env_command(&session.shell_type, key, value)?;

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

        let command = get_env_command(&session.shell_type, key)?;

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

        // Use the appropriate command to list all environment variables per shell
        let env_cmd = match session.shell_type {
            ShellType::PowerShell => {
                "Get-ChildItem Env: | ForEach-Object { \"$($_.Name)=$($_.Value)\" }"
            }
            ShellType::Cmd => "set",
            _ => "env",
        };
        let output = session.execute_command(env_cmd)?;

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

        let command = unset_env_command(&session.shell_type, key)?;

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

/// Bug #191 fix: Scrub potential secrets from a command string before storing in DB.
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

    // Bug #191 fix: Scrub potential secrets before persisting to DB
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

    // AUDIT-TERMINAL-029 fix: Include session_id to make history session-scoped
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

    // AUDIT-TERMINAL-029 fix: Filter by session_id to make history session-scoped
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
