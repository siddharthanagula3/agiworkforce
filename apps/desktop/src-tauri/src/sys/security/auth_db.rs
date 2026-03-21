use super::auth::{Session, User, UserRole};
use super::oauth::OAuthProvider;
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::Arc;
use tracing::warn;
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

/// Compute a constant-time HMAC-SHA256 hex digest of a token using the machine key.
/// Used as the lookup key in the DB so we never store raw tokens.
fn hmac_token(token: &str) -> Result<String, String> {
    let key_bytes = crate::sys::security::machine_key::derive_key(
        crate::sys::security::machine_key::KeyPurpose::MasterEncryption,
    );
    let mut mac =
        HmacSha256::new_from_slice(&key_bytes).map_err(|e| format!("HMAC init failed: {e}"))?;
    mac.update(token.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

/// Encrypt a token with AES-GCM using the machine key.
/// Returns a JSON string of EncryptedSecret for storage.
fn encrypt_token(token: &str) -> Result<String, String> {
    let key_bytes = crate::sys::security::machine_key::derive_key(
        crate::sys::security::machine_key::KeyPurpose::MasterEncryption,
    );
    let encrypted = crate::sys::security::encryption::encrypt_secret(&key_bytes, token)?;
    serde_json::to_string(&encrypted).map_err(|e| format!("Serialize encrypted token: {e}"))
}

fn encrypt_optional_token(token: Option<&str>) -> Result<Option<String>, String> {
    token.map(encrypt_token).transpose()
}

/// Decrypt a token that was stored as JSON-encoded EncryptedSecret.
fn decrypt_token(stored: &str) -> Result<String, String> {
    let enc = serde_json::from_str::<crate::sys::security::encryption::EncryptedSecret>(stored)
        .map_err(|e| format!("Deserialize encrypted token: {e}"))?;
    let key_bytes = crate::sys::security::machine_key::derive_key(
        crate::sys::security::machine_key::KeyPurpose::MasterEncryption,
    );
    crate::sys::security::encryption::decrypt_secret(&key_bytes, &enc)
}

pub struct AuthDatabaseManager {
    db: Arc<parking_lot::Mutex<Connection>>,
}

impl AuthDatabaseManager {
    pub fn new(db: Arc<parking_lot::Mutex<Connection>>) -> Self {
        Self { db }
    }

    pub fn register(&self, email: String, password_hash: String, role: UserRole) -> Result<User> {
        // Basic email validation: must contain @, no null bytes, reasonable length
        if !email.contains('@') || email.contains('\0') || email.len() > 254 || email.len() < 3 {
            return Err(anyhow!("Invalid email address format"));
        }

        let db = self.db.lock();

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
                0,
            ],
        )?;

        Ok(user)
    }

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
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|e| {
                            warn!(
                                "Failed to parse created_at timestamp: {}, using current time",
                                e
                            );
                            Utc::now()
                        }),
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
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|e| {
                            warn!(
                                "Failed to parse created_at timestamp: {}, using current time",
                                e
                            );
                            Utc::now()
                        }),
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

    pub fn create_session(
        &self,
        session: &Session,
        ip_address: Option<String>,
        user_agent: Option<String>,
    ) -> Result<()> {
        let db = self.db.lock();

        let access_token_hash = hmac_token(&session.access_token)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))?;
        let access_token_encrypted = encrypt_token(&session.access_token)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))?;
        let refresh_token_hash = hmac_token(&session.refresh_token)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))?;
        let refresh_token_encrypted = encrypt_token(&session.refresh_token)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))?;

        // SECURITY: Do NOT store plaintext tokens — only store hashes (for lookup) and encrypted forms (for retrieval)
        db.execute(
            "INSERT INTO auth_sessions (session_id, user_id, access_token, refresh_token,
             access_token_hash, access_token_encrypted, refresh_token_hash, refresh_token_encrypted,
             created_at, expires_at, last_activity_at, ip_address, user_agent)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                &session.session_id,
                &session.user_id,
                "[redacted]",
                "[redacted]",
                &access_token_hash,
                &access_token_encrypted,
                &refresh_token_hash,
                &refresh_token_encrypted,
                session.created_at.to_rfc3339(),
                session.expires_at.to_rfc3339(),
                session.last_activity_at.to_rfc3339(),
                ip_address,
                user_agent,
            ],
        )?;

        Ok(())
    }

    pub fn get_session_by_access_token(&self, access_token: &str) -> Result<Session> {
        let db = self.db.lock();

        let token_hash = hmac_token(access_token)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))?;

        let session = db.query_row(
            "SELECT session_id, user_id, access_token_encrypted, refresh_token_encrypted,
             created_at, expires_at, last_activity_at
             FROM auth_sessions WHERE access_token_hash = ?1",
            [&token_hash],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )?;

        let (session_id, user_id, access_enc, refresh_enc, created, expires, last_act) = session;
        let access = decrypt_token(&access_enc).map_err(|e| {
            anyhow!(
                "[AUTH] Access token decryption failed for session {}: {}",
                session_id,
                e
            )
        })?;
        let refresh = decrypt_token(&refresh_enc).map_err(|e| {
            anyhow!(
                "[AUTH] Refresh token decryption failed for session {}: {}",
                session_id,
                e
            )
        })?;
        let session = Session {
            session_id,
            user_id,
            access_token: access,
            refresh_token: refresh,
            created_at: DateTime::parse_from_rfc3339(&created)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            expires_at: DateTime::parse_from_rfc3339(&expires)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            last_activity_at: DateTime::parse_from_rfc3339(&last_act)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        };

        Ok(session)
    }

    pub fn get_session_by_refresh_token(&self, refresh_token: &str) -> Result<Session> {
        let db = self.db.lock();

        let token_hash = hmac_token(refresh_token)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))?;

        let session = db.query_row(
            "SELECT session_id, user_id, access_token_encrypted, refresh_token_encrypted,
             created_at, expires_at, last_activity_at
             FROM auth_sessions WHERE refresh_token_hash = ?1",
            [&token_hash],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )?;

        let (session_id, user_id, access_enc, refresh_enc, created, expires, last_act) = session;
        let access = decrypt_token(&access_enc).map_err(|e| {
            anyhow!(
                "[AUTH] Access token decryption failed for session {}: {}",
                session_id,
                e
            )
        })?;
        let refresh = decrypt_token(&refresh_enc).map_err(|e| {
            anyhow!(
                "[AUTH] Refresh token decryption failed for session {}: {}",
                session_id,
                e
            )
        })?;
        let session = Session {
            session_id,
            user_id,
            access_token: access,
            refresh_token: refresh,
            created_at: DateTime::parse_from_rfc3339(&created)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            expires_at: DateTime::parse_from_rfc3339(&expires)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            last_activity_at: DateTime::parse_from_rfc3339(&last_act)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        };

        Ok(session)
    }

    pub fn update_session_activity(&self, session_id: &str) -> Result<()> {
        let db = self.db.lock();

        db.execute(
            "UPDATE auth_sessions SET last_activity_at = ?1 WHERE session_id = ?2",
            params![Utc::now().to_rfc3339(), session_id],
        )?;

        Ok(())
    }

    pub fn update_session_tokens(
        &self,
        session_id: &str,
        new_access_token: &str,
        new_expires_at: DateTime<Utc>,
    ) -> Result<()> {
        let db = self.db.lock();

        let access_token_hash = hmac_token(new_access_token)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))?;
        let access_token_encrypted = encrypt_token(new_access_token)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))?;

        // SECURITY: Do NOT store plaintext token — only store hash (for lookup) and encrypted form (for retrieval)
        db.execute(
            "UPDATE auth_sessions SET
             access_token = ?1,
             access_token_hash = ?2,
             access_token_encrypted = ?3,
             expires_at = ?4,
             last_activity_at = ?5
             WHERE session_id = ?6",
            params![
                "[redacted]",
                &access_token_hash,
                &access_token_encrypted,
                new_expires_at.to_rfc3339(),
                Utc::now().to_rfc3339(),
                session_id,
            ],
        )?;

        Ok(())
    }

    pub fn delete_session(&self, access_token: &str) -> Result<()> {
        let db = self.db.lock();

        let token_hash = hmac_token(access_token)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))?;

        db.execute(
            "DELETE FROM auth_sessions WHERE access_token_hash = ?1",
            params![&token_hash],
        )?;

        Ok(())
    }

    pub fn cleanup_expired_sessions(&self) -> Result<usize> {
        let db = self.db.lock();

        let count = db.execute(
            "DELETE FROM auth_sessions WHERE expires_at < ?1",
            [Utc::now().to_rfc3339()],
        )?;

        Ok(count)
    }

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
        let access_token_encrypted = encrypt_optional_token(access_token)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))?;
        let refresh_token_encrypted = encrypt_optional_token(refresh_token)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))?;

        db.execute(
            "INSERT OR REPLACE INTO oauth_providers
             (id, user_id, provider, provider_user_id, access_token_encrypted, refresh_token_encrypted,
              expires_at, scope, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                &id,
                user_id,
                provider.as_str(),
                provider_user_id,
                access_token_encrypted,
                refresh_token_encrypted,
                expires_at.map(|t| t.to_rfc3339()),
                scope,
                now.to_rfc3339(),
                now.to_rfc3339(),
            ],
        )?;

        Ok(id)
    }

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

    pub fn update_password(&self, user_id: &str, new_password_hash: &str) -> Result<()> {
        let db = self.db.lock();

        db.execute(
            "UPDATE users SET password_hash = ?1 WHERE id = ?2",
            params![new_password_hash, user_id],
        )?;

        Ok(())
    }

    pub fn update_user_role(&self, user_id: &str, role: UserRole) -> Result<()> {
        let db = self.db.lock();

        db.execute(
            "UPDATE users SET role = ?1 WHERE id = ?2",
            params![role.as_str(), user_id],
        )?;

        Ok(())
    }

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
        crate::data::db::migrations::run_migrations(&conn).unwrap();
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

    #[test]
    fn test_create_session_redacts_legacy_columns_and_round_trips() {
        let db = setup_test_db();
        let manager = AuthDatabaseManager::new(db.clone());
        let user = manager
            .register(
                "sessions@example.com".to_string(),
                "password_hash".to_string(),
                UserRole::Editor,
            )
            .unwrap();
        let session = Session::new(user.id.clone());

        manager
            .create_session(&session, Some("127.0.0.1".to_string()), None)
            .unwrap();

        let stored = db
            .lock()
            .query_row(
                "SELECT access_token, refresh_token, access_token_encrypted, refresh_token_encrypted
                 FROM auth_sessions WHERE session_id = ?1",
                [&session.session_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .unwrap();

        assert_eq!(stored.0, "[redacted]");
        assert_eq!(stored.1, "[redacted]");
        assert_eq!(decrypt_token(&stored.2).unwrap(), session.access_token);
        assert_eq!(decrypt_token(&stored.3).unwrap(), session.refresh_token);

        let retrieved = manager
            .get_session_by_access_token(&session.access_token)
            .unwrap();
        assert_eq!(retrieved.session_id, session.session_id);
        assert_eq!(retrieved.access_token, session.access_token);
        assert_eq!(retrieved.refresh_token, session.refresh_token);
    }

    #[test]
    fn test_create_session_allows_multiple_redacted_rows() {
        let db = setup_test_db();
        let manager = AuthDatabaseManager::new(db);
        let user = manager
            .register(
                "multi-session@example.com".to_string(),
                "password_hash".to_string(),
                UserRole::Editor,
            )
            .unwrap();

        let session_one = Session::new(user.id.clone());
        let session_two = Session::new(user.id.clone());

        manager.create_session(&session_one, None, None).unwrap();
        manager.create_session(&session_two, None, None).unwrap();
    }

    #[test]
    fn test_update_session_tokens_keeps_legacy_column_redacted() {
        let db = setup_test_db();
        let manager = AuthDatabaseManager::new(db.clone());
        let user = manager
            .register(
                "rotate@example.com".to_string(),
                "password_hash".to_string(),
                UserRole::Editor,
            )
            .unwrap();

        let session = Session::new(user.id.clone());
        manager.create_session(&session, None, None).unwrap();

        let rotated_token = "rotated-access-token";
        manager
            .update_session_tokens(&session.session_id, rotated_token, Utc::now())
            .unwrap();

        let stored = db
            .lock()
            .query_row(
                "SELECT access_token, access_token_encrypted FROM auth_sessions WHERE session_id = ?1",
                [&session.session_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .unwrap();

        assert_eq!(stored.0, "[redacted]");
        assert_eq!(decrypt_token(&stored.1).unwrap(), rotated_token);

        let retrieved = manager.get_session_by_access_token(rotated_token).unwrap();
        assert_eq!(retrieved.session_id, session.session_id);
        assert_eq!(retrieved.access_token, rotated_token);
    }

    #[test]
    fn test_delete_session_uses_token_hash_lookup() {
        let db = setup_test_db();
        let manager = AuthDatabaseManager::new(db.clone());
        let user = manager
            .register(
                "delete@example.com".to_string(),
                "password_hash".to_string(),
                UserRole::Editor,
            )
            .unwrap();

        let session = Session::new(user.id.clone());
        manager.create_session(&session, None, None).unwrap();
        manager.delete_session(&session.access_token).unwrap();

        let remaining: i64 = db
            .lock()
            .query_row("SELECT COUNT(*) FROM auth_sessions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 0);
    }

    #[test]
    fn test_store_oauth_provider_uses_encrypted_columns() {
        let db = setup_test_db();
        let manager = AuthDatabaseManager::new(db.clone());
        let user = manager
            .register(
                "oauth@example.com".to_string(),
                "password_hash".to_string(),
                UserRole::Editor,
            )
            .unwrap();

        let provider_id = manager
            .store_oauth_provider(
                &user.id,
                OAuthProvider::Google,
                "provider-user",
                Some("oauth-access"),
                Some("oauth-refresh"),
                None,
                Some("openid email"),
            )
            .unwrap();

        let stored = db
            .lock()
            .query_row(
                "SELECT access_token_encrypted, refresh_token_encrypted
                 FROM oauth_providers WHERE id = ?1",
                [&provider_id],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, Option<String>>(1)?,
                    ))
                },
            )
            .unwrap();

        assert_eq!(
            decrypt_token(stored.0.as_deref().unwrap()).unwrap(),
            "oauth-access"
        );
        assert_eq!(
            decrypt_token(stored.1.as_deref().unwrap()).unwrap(),
            "oauth-refresh"
        );
        assert_eq!(
            manager
                .get_oauth_provider(OAuthProvider::Google, "provider-user")
                .unwrap()
                .as_deref(),
            Some(user.id.as_str())
        );
    }
}
