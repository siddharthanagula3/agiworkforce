use super::auth::{Session, User, UserRole};
use super::oauth::OAuthProvider;
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::Arc;
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

/// Decrypt a token that was stored as JSON-encoded EncryptedSecret.
/// Falls back to returning the value as-is if it is not valid JSON (migration path for old plaintext rows).
fn decrypt_token(stored: &str) -> Result<String, String> {
    match serde_json::from_str::<crate::sys::security::encryption::EncryptedSecret>(stored) {
        Ok(enc) => {
            let key_bytes = crate::sys::security::machine_key::derive_key(
                crate::sys::security::machine_key::KeyPurpose::MasterEncryption,
            );
            crate::sys::security::encryption::decrypt_secret(&key_bytes, &enc)
        }
        Err(_) => {
            // Old plaintext row — return as-is (migration path)
            Ok(stored.to_string())
        }
    }
}

pub struct AuthDatabaseManager {
    db: Arc<parking_lot::Mutex<Connection>>,
}

impl AuthDatabaseManager {
    pub fn new(db: Arc<parking_lot::Mutex<Connection>>) -> Self {
        Self { db }
    }

    pub fn register(&self, email: String, password_hash: String, role: UserRole) -> Result<User> {
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
                    // AUDIT-003-003 fix: Use unwrap_or_default to prevent panic on malformed dates
                    created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
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
                    // AUDIT-003-003 fix: Use unwrap_or_default to prevent panic on malformed dates
                    created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
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

        db.execute(
            "INSERT INTO auth_sessions (session_id, user_id, access_token, refresh_token,
             access_token_hash, access_token_encrypted, refresh_token_hash, refresh_token_encrypted,
             created_at, expires_at, last_activity_at, ip_address, user_agent)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                &session.session_id,
                &session.user_id,
                &session.access_token,
                &session.refresh_token,
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

        let session = db
            .query_row(
                "SELECT session_id, user_id, access_token, refresh_token,
             COALESCE(access_token_encrypted, access_token),
             COALESCE(refresh_token_encrypted, refresh_token),
             created_at, expires_at, last_activity_at
             FROM auth_sessions WHERE access_token_hash = ?1",
                [&token_hash],
                |row| {
                    // AUDIT-003-003 fix: Use unwrap_or_else to prevent panic on malformed dates
                    let access_token_stored: String = row.get(4)?;
                    let refresh_token_stored: String = row.get(5)?;
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        access_token_stored,
                        refresh_token_stored,
                        row.get::<_, String>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, String>(8)?,
                    ))
                },
            )
            .map(
                |(session_id, user_id, access_enc, refresh_enc, created, expires, last_act)| {
                    let access = decrypt_token(&access_enc).unwrap_or(access_enc);
                    let refresh = decrypt_token(&refresh_enc).unwrap_or(refresh_enc);
                    Session {
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
                    }
                },
            )?;

        Ok(session)
    }

    pub fn get_session_by_refresh_token(&self, refresh_token: &str) -> Result<Session> {
        let db = self.db.lock();

        let token_hash = hmac_token(refresh_token)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))?;

        let session = db
            .query_row(
                "SELECT session_id, user_id, access_token, refresh_token,
             COALESCE(access_token_encrypted, access_token),
             COALESCE(refresh_token_encrypted, refresh_token),
             created_at, expires_at, last_activity_at
             FROM auth_sessions WHERE refresh_token_hash = ?1",
                [&token_hash],
                |row| {
                    // AUDIT-003-003 fix: Use unwrap_or_else to prevent panic on malformed dates
                    let access_token_stored: String = row.get(4)?;
                    let refresh_token_stored: String = row.get(5)?;
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        access_token_stored,
                        refresh_token_stored,
                        row.get::<_, String>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, String>(8)?,
                    ))
                },
            )
            .map(
                |(session_id, user_id, access_enc, refresh_enc, created, expires, last_act)| {
                    let access = decrypt_token(&access_enc).unwrap_or(access_enc);
                    let refresh = decrypt_token(&refresh_enc).unwrap_or(refresh_enc);
                    Session {
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
                    }
                },
            )?;

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

        db.execute(
            "UPDATE auth_sessions SET
             access_token = ?1,
             access_token_hash = ?2,
             access_token_encrypted = ?3,
             expires_at = ?4,
             last_activity_at = ?5
             WHERE session_id = ?6",
            params![
                new_access_token,
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
            "DELETE FROM auth_sessions WHERE access_token_hash = ?1 OR access_token = ?2",
            params![&token_hash, access_token],
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
}
