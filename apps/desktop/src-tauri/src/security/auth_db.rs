use super::auth::{Session, User, UserRole};
use super::oauth::OAuthProvider;
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

/// Database-backed authentication manager
pub struct AuthDatabaseManager {
    db: Arc<parking_lot::Mutex<Connection>>,
}

impl AuthDatabaseManager {
    pub fn new(db: Arc<parking_lot::Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Register a new user
    pub fn register(&self, email: String, password_hash: String, role: UserRole) -> Result<User> {
        let db = self.db.lock();

        // Check if email already exists
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM users WHERE email = ?1)",
                [&email],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if exists {
            return Err(anyhow!("Email already registered"));
        }

        let user = User {
            id: Uuid::new_v4().to_string(),
            email: email.clone(),
            password_hash,
            role,
            created_at: Utc::now(),
            last_login_at: None,
            failed_login_attempts: 0,
            locked_until: None,
        };

        db.execute(
            "INSERT INTO users (id, email, password_hash, role, created_at, last_login_at,
             failed_login_attempts, locked_until, email_verified)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &user.id,
                &user.email,
                &user.password_hash,
                user.role.as_str(),
                user.created_at.to_rfc3339(),
                user.last_login_at.map(|t| t.to_rfc3339()),
                user.failed_login_attempts,
                user.locked_until.map(|t| t.to_rfc3339()),
                0, // email_verified
            ],
        )?;

        Ok(user)
    }

    /// Get user by ID
    pub fn get_user(&self, user_id: &str) -> Result<User> {
        let db = self.db.lock();

        let user = db.query_row(
            "SELECT id, email, password_hash, role, created_at, last_login_at,
             failed_login_attempts, locked_until
             FROM users WHERE id = ?1",
            [user_id],
            |row| {
                Ok(User {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    password_hash: row.get(2)?,
                    role: UserRole::from_str(&row.get::<_, String>(3)?).unwrap_or(UserRole::Viewer),
                    created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                        .unwrap()
                        .with_timezone(&Utc),
                    last_login_at: row
                        .get::<_, Option<String>>(5)?
                        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                        .map(|dt| dt.with_timezone(&Utc)),
                    failed_login_attempts: row.get(6)?,
                    locked_until: row
                        .get::<_, Option<String>>(7)?
                        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                        .map(|dt| dt.with_timezone(&Utc)),
                })
            },
        )?;

        Ok(user)
    }

    /// Get user by email
    pub fn get_user_by_email(&self, email: &str) -> Result<User> {
        let db = self.db.lock();

        let user = db.query_row(
            "SELECT id, email, password_hash, role, created_at, last_login_at,
             failed_login_attempts, locked_until
             FROM users WHERE email = ?1",
            [email],
            |row| {
                Ok(User {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    password_hash: row.get(2)?,
                    role: UserRole::from_str(&row.get::<_, String>(3)?).unwrap_or(UserRole::Viewer),
                    created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                        .unwrap()
                        .with_timezone(&Utc),
                    last_login_at: row
                        .get::<_, Option<String>>(5)?
                        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                        .map(|dt| dt.with_timezone(&Utc)),
                    failed_login_attempts: row.get(6)?,
                    locked_until: row
                        .get::<_, Option<String>>(7)?
                        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                        .map(|dt| dt.with_timezone(&Utc)),
                })
            },
        )?;

        Ok(user)
    }

    /// Update user's failed login attempts
    pub fn record_failed_login(
        &self,
        user_id: &str,
        locked_until: Option<DateTime<Utc>>,
    ) -> Result<()> {
        let db = self.db.lock();

        db.execute(
            "UPDATE users SET
             failed_login_attempts = failed_login_attempts + 1,
             locked_until = ?1
             WHERE id = ?2",
            params![locked_until.map(|t| t.to_rfc3339()), user_id,],
        )?;

        Ok(())
    }

    /// Update user's successful login
    pub fn record_successful_login(&self, user_id: &str) -> Result<()> {
        let db = self.db.lock();

        db.execute(
            "UPDATE users SET
             last_login_at = ?1,
             failed_login_attempts = 0,
             locked_until = NULL
             WHERE id = ?2",
            params![Utc::now().to_rfc3339(), user_id,],
        )?;

        Ok(())
    }

    /// Create session
    pub fn create_session(
        &self,
        session: &Session,
        ip_address: Option<String>,
        user_agent: Option<String>,
    ) -> Result<()> {
        let db = self.db.lock();

        db.execute(
            "INSERT INTO auth_sessions (session_id, user_id, access_token, refresh_token,
             created_at, expires_at, last_activity_at, ip_address, user_agent)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &session.session_id,
                &session.user_id,
                &session.access_token,
                &session.refresh_token,
                session.created_at.to_rfc3339(),
                session.expires_at.to_rfc3339(),
                session.last_activity_at.to_rfc3339(),
                ip_address,
                user_agent,
            ],
        )?;

        Ok(())
    }

    /// Get session by access token
    pub fn get_session_by_access_token(&self, access_token: &str) -> Result<Session> {
        let db = self.db.lock();

        let session = db.query_row(
            "SELECT session_id, user_id, access_token, refresh_token, created_at,
             expires_at, last_activity_at
             FROM auth_sessions WHERE access_token = ?1",
            [access_token],
            |row| {
                Ok(Session {
                    session_id: row.get(0)?,
                    user_id: row.get(1)?,
                    access_token: row.get(2)?,
                    refresh_token: row.get(3)?,
                    created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                        .unwrap()
                        .with_timezone(&Utc),
                    expires_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(5)?)
                        .unwrap()
                        .with_timezone(&Utc),
                    last_activity_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(6)?)
                        .unwrap()
                        .with_timezone(&Utc),
                })
            },
        )?;

        Ok(session)
    }

    /// Get session by refresh token
    pub fn get_session_by_refresh_token(&self, refresh_token: &str) -> Result<Session> {
        let db = self.db.lock();

        let session = db.query_row(
            "SELECT session_id, user_id, access_token, refresh_token, created_at,
             expires_at, last_activity_at
             FROM auth_sessions WHERE refresh_token = ?1",
            [refresh_token],
            |row| {
                Ok(Session {
                    session_id: row.get(0)?,
                    user_id: row.get(1)?,
                    access_token: row.get(2)?,
                    refresh_token: row.get(3)?,
                    created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                        .unwrap()
                        .with_timezone(&Utc),
                    expires_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(5)?)
                        .unwrap()
                        .with_timezone(&Utc),
                    last_activity_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(6)?)
                        .unwrap()
                        .with_timezone(&Utc),
                })
            },
        )?;

        Ok(session)
    }

    /// Update session activity
    pub fn update_session_activity(&self, session_id: &str) -> Result<()> {
        let db = self.db.lock();

        db.execute(
            "UPDATE auth_sessions SET last_activity_at = ?1 WHERE session_id = ?2",
            params![Utc::now().to_rfc3339(), session_id],
        )?;

        Ok(())
    }

    /// Update session tokens (for refresh)
    pub fn update_session_tokens(
        &self,
        session_id: &str,
        new_access_token: &str,
        new_expires_at: DateTime<Utc>,
    ) -> Result<()> {
        let db = self.db.lock();

        db.execute(
            "UPDATE auth_sessions SET
             access_token = ?1,
             expires_at = ?2,
             last_activity_at = ?3
             WHERE session_id = ?4",
            params![
                new_access_token,
                new_expires_at.to_rfc3339(),
                Utc::now().to_rfc3339(),
                session_id,
            ],
        )?;

        Ok(())
    }

    /// Delete session (logout)
    pub fn delete_session(&self, access_token: &str) -> Result<()> {
        let db = self.db.lock();

        db.execute(
            "DELETE FROM auth_sessions WHERE access_token = ?1",
            [access_token],
        )?;

        Ok(())
    }

    /// Clean up expired sessions
    pub fn cleanup_expired_sessions(&self) -> Result<usize> {
        let db = self.db.lock();

        let count = db.execute(
            "DELETE FROM auth_sessions WHERE expires_at < ?1",
            [Utc::now().to_rfc3339()],
        )?;

        Ok(count)
    }

    /// Store OAuth provider connection
    pub fn store_oauth_provider(
        &self,
        user_id: &str,
        provider: OAuthProvider,
        provider_user_id: &str,
        access_token: Option<&str>,
        refresh_token: Option<&str>,
        expires_at: Option<DateTime<Utc>>,
        scope: Option<&str>,
    ) -> Result<String> {
        let db = self.db.lock();

        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        db.execute(
            "INSERT OR REPLACE INTO oauth_providers
             (id, user_id, provider, provider_user_id, access_token, refresh_token,
              expires_at, scope, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                &id,
                user_id,
                provider.as_str(),
                provider_user_id,
                access_token,
                refresh_token,
                expires_at.map(|t| t.to_rfc3339()),
                scope,
                now.to_rfc3339(),
                now.to_rfc3339(),
            ],
        )?;

        Ok(id)
    }

    /// Get OAuth provider by provider and provider_user_id
    pub fn get_oauth_provider(
        &self,
        provider: OAuthProvider,
        provider_user_id: &str,
    ) -> Result<Option<String>> {
        let db = self.db.lock();

        let user_id: Option<String> = db
            .query_row(
                "SELECT user_id FROM oauth_providers WHERE provider = ?1 AND provider_user_id = ?2",
                params![provider.as_str(), provider_user_id],
                |row| row.get(0),
            )
            .optional()?;

        Ok(user_id)
    }

    /// Update password
    pub fn update_password(&self, user_id: &str, new_password_hash: &str) -> Result<()> {
        let db = self.db.lock();

        db.execute(
            "UPDATE users SET password_hash = ?1 WHERE id = ?2",
            params![new_password_hash, user_id],
        )?;

        Ok(())
    }

    /// Update user role
    pub fn update_user_role(&self, user_id: &str, role: UserRole) -> Result<()> {
        let db = self.db.lock();

        db.execute(
            "UPDATE users SET role = ?1 WHERE id = ?2",
            params![role.as_str(), user_id],
        )?;

        Ok(())
    }

    /// Log authentication event
    pub fn log_auth_event(
        &self,
        user_id: Option<&str>,
        event_type: &str,
        event_data: Option<&str>,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
        success: bool,
        error_message: Option<&str>,
    ) -> Result<()> {
        let db = self.db.lock();

        db.execute(
            "INSERT INTO auth_audit_log
             (id, user_id, event_type, event_data, ip_address, user_agent, success,
              error_message, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                Uuid::new_v4().to_string(),
                user_id,
                event_type,
                event_data,
                ip_address,
                user_agent,
                if success { 1 } else { 0 },
                error_message,
                Utc::now().to_rfc3339(),
            ],
        )?;

        Ok(())
    }

    /// Get audit logs for a user
    pub fn get_user_audit_logs(&self, user_id: &str, limit: usize) -> Result<Vec<AuthAuditLog>> {
        let db = self.db.lock();

        let mut stmt = db.prepare(
            "SELECT id, user_id, event_type, event_data, ip_address, user_agent,
             success, error_message, created_at
             FROM auth_audit_log
             WHERE user_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        )?;

        let logs = stmt
            .query_map(params![user_id, limit], |row| {
                Ok(AuthAuditLog {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    event_type: row.get(2)?,
                    event_data: row.get(3)?,
                    ip_address: row.get(4)?,
                    user_agent: row.get(5)?,
                    success: row.get::<_, i32>(6)? != 0,
                    error_message: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(logs)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthAuditLog {
    pub id: String,
    pub user_id: Option<String>,
    pub event_type: String,
    pub event_data: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub success: bool,
    pub error_message: Option<String>,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Arc<parking_lot::Mutex<Connection>> {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::run_migrations(&conn).unwrap();
        Arc::new(parking_lot::Mutex::new(conn))
    }

    #[test]
    fn test_register_and_get_user() {
        let db = setup_test_db();
        let manager = AuthDatabaseManager::new(db);

        let user = manager
            .register(
                "test@example.com".to_string(),
                "password_hash".to_string(),
                UserRole::Editor,
            )
            .unwrap();

        assert_eq!(user.email, "test@example.com");
        assert_eq!(user.role, UserRole::Editor);

        let retrieved = manager.get_user(&user.id).unwrap();
        assert_eq!(retrieved.id, user.id);
        assert_eq!(retrieved.email, user.email);
    }

    #[test]
    fn test_duplicate_registration() {
        let db = setup_test_db();
        let manager = AuthDatabaseManager::new(db);

        manager
            .register(
                "test@example.com".to_string(),
                "password_hash".to_string(),
                UserRole::Editor,
            )
            .unwrap();

        let result = manager.register(
            "test@example.com".to_string(),
            "password_hash2".to_string(),
            UserRole::Editor,
        );

        assert!(result.is_err());
    }
}
