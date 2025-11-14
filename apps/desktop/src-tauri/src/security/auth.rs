use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

use super::secret_manager::SecretManager;

const ACCESS_TOKEN_DURATION: i64 = 60; // 1 hour
const REFRESH_TOKEN_DURATION: i64 = 30 * 24 * 60; // 30 days
const MAX_FAILED_ATTEMPTS: u32 = 5;
const LOCKOUT_DURATION: i64 = 15; // 15 minutes
const INACTIVITY_TIMEOUT: i64 = 15; // 15 minutes

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Viewer,
    Editor,
    Admin,
}

impl UserRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            UserRole::Viewer => "viewer",
            UserRole::Editor => "editor",
            UserRole::Admin => "admin",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "viewer" => Some(UserRole::Viewer),
            "editor" => Some(UserRole::Editor),
            "admin" => Some(UserRole::Admin),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub password_hash: String,
    pub role: UserRole,
    pub created_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
    pub failed_login_attempts: u32,
    pub locked_until: Option<DateTime<Utc>>,
}

impl User {
    pub fn new(email: String, password: &str, role: UserRole) -> Result<Self, String> {
        let password_hash = hash_password(password)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            email,
            password_hash,
            role,
            created_at: Utc::now(),
            last_login_at: None,
            failed_login_attempts: 0,
            locked_until: None,
        })
    }

    pub fn verify_password(&self, password: &str) -> Result<bool, String> {
        verify_password(password, &self.password_hash)
    }

    pub fn is_locked(&self) -> bool {
        if let Some(locked_until) = self.locked_until {
            Utc::now() < locked_until
        } else {
            false
        }
    }

    pub fn record_failed_login(&mut self) {
        self.failed_login_attempts += 1;
        if self.failed_login_attempts >= MAX_FAILED_ATTEMPTS {
            self.locked_until = Some(Utc::now() + Duration::minutes(LOCKOUT_DURATION));
        }
    }

    pub fn record_successful_login(&mut self) {
        self.last_login_at = Some(Utc::now());
        self.failed_login_attempts = 0;
        self.locked_until = None;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub session_id: String,
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub last_activity_at: DateTime<Utc>,
}

impl Session {
    pub fn new(user_id: String) -> Self {
        let now = Utc::now();
        Self {
            session_id: Uuid::new_v4().to_string(),
            user_id,
            access_token: generate_token(),
            refresh_token: generate_token(),
            created_at: now,
            expires_at: now + Duration::minutes(REFRESH_TOKEN_DURATION),
            last_activity_at: now,
        }
    }

    pub fn is_expired(&self) -> bool {
        Utc::now() > self.expires_at
    }

    pub fn is_inactive(&self) -> bool {
        Utc::now() > self.last_activity_at + Duration::minutes(INACTIVITY_TIMEOUT)
    }

    pub fn update_activity(&mut self) {
        self.last_activity_at = Utc::now();
    }

    pub fn refresh(&mut self) {
        self.access_token = generate_token();
        self.expires_at = Utc::now() + Duration::minutes(REFRESH_TOKEN_DURATION);
        self.last_activity_at = Utc::now();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthToken {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
}

impl AuthToken {
    pub fn from_session(session: &Session) -> Self {
        Self {
            access_token: session.access_token.clone(),
            refresh_token: session.refresh_token.clone(),
            token_type: "Bearer".to_string(),
            expires_in: ACCESS_TOKEN_DURATION * 60, // Convert to seconds
        }
    }
}

/// Authentication manager
pub struct AuthManager {
    users: Arc<parking_lot::RwLock<HashMap<String, User>>>,
    sessions: Arc<parking_lot::RwLock<HashMap<String, Session>>>,
    secret_manager: Arc<SecretManager>,
}

impl AuthManager {
    /// Create a new AuthManager with a SecretManager for secure JWT secret handling
    ///
    /// # Security
    /// The SecretManager handles secure generation and storage of JWT secrets
    /// using OS keyring (primary) and database (fallback) storage.
    pub fn new(secret_manager: Arc<SecretManager>) -> Self {
        Self {
            users: Arc::new(parking_lot::RwLock::new(HashMap::new())),
            sessions: Arc::new(parking_lot::RwLock::new(HashMap::new())),
            secret_manager,
        }
    }

    /// Get the JWT secret (used internally for token signing/verification)
    ///
    /// # Security Note
    /// This method should only be used internally. The secret is retrieved
    /// from secure storage and should never be logged or exposed.
    fn get_jwt_secret(&self) -> Result<String, String> {
        self.secret_manager
            .get_or_create_jwt_secret()
            .map_err(|e| format!("Failed to retrieve JWT secret: {}", e))
    }

    /// Rotate the JWT secret (invalidates all existing sessions)
    ///
    /// # Warning
    /// This will force all users to re-authenticate. Use this when:
    /// - You suspect the secret has been compromised
    /// - As part of regular security maintenance
    /// - When implementing security policy changes
    pub fn rotate_jwt_secret(&self) -> Result<(), String> {
        // Rotate the secret
        self.secret_manager
            .rotate_jwt_secret()
            .map_err(|e| format!("Failed to rotate JWT secret: {}", e))?;

        // Invalidate all existing sessions
        let mut sessions = self.sessions.write();
        sessions.clear();

        Ok(())
    }

    /// Register a new user
    pub fn register(&self, email: String, password: &str, role: UserRole) -> Result<User, String> {
        let users = self.users.read();
        if users.values().any(|u| u.email == email) {
            return Err("Email already registered".to_string());
        }
        drop(users);

        let user = User::new(email, password, role)?;
        let mut users = self.users.write();
        users.insert(user.id.clone(), user.clone());

        Ok(user)
    }

    /// Login with email and password
    pub fn login(&self, email: &str, password: &str) -> Result<AuthToken, String> {
        let mut users = self.users.write();
        let user = users
            .values_mut()
            .find(|u| u.email == email)
            .ok_or("Invalid email or password")?;

        if user.is_locked() {
            return Err(format!(
                "Account locked until {}",
                user.locked_until.unwrap().format("%Y-%m-%d %H:%M:%S")
            ));
        }

        if !user.verify_password(password)? {
            user.record_failed_login();
            return Err("Invalid email or password".to_string());
        }

        user.record_successful_login();
        let user_id = user.id.clone();
        drop(users);

        let session = Session::new(user_id);
        let token = AuthToken::from_session(&session);

        let mut sessions = self.sessions.write();
        sessions.insert(session.session_id.clone(), session);

        Ok(token)
    }

    /// Logout (invalidate session)
    pub fn logout(&self, access_token: &str) -> Result<(), String> {
        let mut sessions = self.sessions.write();
        let session_id = sessions
            .iter()
            .find(|(_, s)| s.access_token == access_token)
            .map(|(id, _)| id.clone())
            .ok_or("Invalid session")?;

        sessions.remove(&session_id);
        Ok(())
    }

    /// Refresh access token
    pub fn refresh_token(&self, refresh_token: &str) -> Result<AuthToken, String> {
        let mut sessions = self.sessions.write();
        let session = sessions
            .values_mut()
            .find(|s| s.refresh_token == refresh_token)
            .ok_or("Invalid refresh token")?;

        if session.is_expired() {
            return Err("Refresh token expired".to_string());
        }

        session.refresh();
        Ok(AuthToken::from_session(session))
    }

    /// Validate access token and check inactivity
    pub fn validate_token(&self, access_token: &str) -> Result<User, String> {
        let mut sessions = self.sessions.write();
        let session = sessions
            .values_mut()
            .find(|s| s.access_token == access_token)
            .ok_or("Invalid access token")?;

        if session.is_expired() {
            return Err("Token expired".to_string());
        }

        if session.is_inactive() {
            return Err("Session timed out due to inactivity".to_string());
        }

        session.update_activity();
        let user_id = session.user_id.clone();
        drop(sessions);

        let users = self.users.read();
        let user = users.get(&user_id).ok_or("User not found")?.clone();

        Ok(user)
    }

    /// Get user by ID
    pub fn get_user(&self, user_id: &str) -> Option<User> {
        let users = self.users.read();
        users.get(user_id).cloned()
    }

    /// Update user role
    pub fn update_role(&self, user_id: &str, role: UserRole) -> Result<(), String> {
        let mut users = self.users.write();
        let user = users.get_mut(user_id).ok_or("User not found")?;

        user.role = role;
        Ok(())
    }

    /// Change password
    pub fn change_password(
        &self,
        user_id: &str,
        old_password: &str,
        new_password: &str,
    ) -> Result<(), String> {
        let mut users = self.users.write();
        let user = users.get_mut(user_id).ok_or("User not found")?;

        if !user.verify_password(old_password)? {
            return Err("Invalid current password".to_string());
        }

        user.password_hash = hash_password(new_password)?;
        Ok(())
    }

    /// Clean up expired sessions
    pub fn cleanup_expired_sessions(&self) {
        let mut sessions = self.sessions.write();
        sessions.retain(|_, session| !session.is_expired());
    }
}

// Note: Default implementation removed - AuthManager requires a SecretManager
// to be constructed securely. Use AuthManager::new(secret_manager) instead.

/// Hash password using Argon2
fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| format!("Failed to hash password: {}", e))
}

/// Verify password against hash
fn verify_password(password: &str, hash: &str) -> Result<bool, String> {
    let parsed_hash =
        PasswordHash::new(hash).map_err(|e| format!("Failed to parse password hash: {}", e))?;

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

/// Generate random token
fn generate_token() -> String {
    use base64::{engine::general_purpose, Engine as _};
    use rand::RngCore;

    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn create_test_auth_manager() -> AuthManager {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )
        .unwrap();

        let secret_manager = Arc::new(SecretManager::new(Arc::new(Mutex::new(conn))));
        AuthManager::new(secret_manager)
    }

    #[test]
    fn test_password_hashing() {
        let password = "test_password_123";
        let hash = hash_password(password).unwrap();

        assert!(verify_password(password, &hash).unwrap());
        assert!(!verify_password("wrong_password", &hash).unwrap());
    }

    #[test]
    fn test_user_registration() {
        let manager = create_test_auth_manager();
        let user = manager
            .register(
                "test@example.com".to_string(),
                "password123",
                UserRole::Editor,
            )
            .unwrap();

        assert_eq!(user.email, "test@example.com");
        assert_eq!(user.role, UserRole::Editor);
    }

    #[test]
    fn test_duplicate_registration() {
        let manager = create_test_auth_manager();
        manager
            .register(
                "test@example.com".to_string(),
                "password123",
                UserRole::Editor,
            )
            .unwrap();

        let result = manager.register(
            "test@example.com".to_string(),
            "password456",
            UserRole::Editor,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_login_success() {
        let manager = create_test_auth_manager();
        manager
            .register(
                "test@example.com".to_string(),
                "password123",
                UserRole::Editor,
            )
            .unwrap();

        let token = manager.login("test@example.com", "password123").unwrap();
        assert!(!token.access_token.is_empty());
        assert!(!token.refresh_token.is_empty());
    }

    #[test]
    fn test_login_failure() {
        let manager = create_test_auth_manager();
        manager
            .register(
                "test@example.com".to_string(),
                "password123",
                UserRole::Editor,
            )
            .unwrap();

        let result = manager.login("test@example.com", "wrong_password");
        assert!(result.is_err());
    }

    #[test]
    fn test_account_lockout() {
        let manager = create_test_auth_manager();
        manager
            .register(
                "test@example.com".to_string(),
                "password123",
                UserRole::Editor,
            )
            .unwrap();

        // Attempt failed logins
        for _ in 0..MAX_FAILED_ATTEMPTS {
            let _ = manager.login("test@example.com", "wrong_password");
        }

        // Account should now be locked
        let result = manager.login("test@example.com", "password123");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("locked"));
    }

    #[test]
    fn test_token_validation() {
        let manager = create_test_auth_manager();
        manager
            .register(
                "test@example.com".to_string(),
                "password123",
                UserRole::Editor,
            )
            .unwrap();

        let token = manager.login("test@example.com", "password123").unwrap();
        let user = manager.validate_token(&token.access_token).unwrap();

        assert_eq!(user.email, "test@example.com");
    }

    #[test]
    fn test_refresh_token() {
        let manager = create_test_auth_manager();
        manager
            .register(
                "test@example.com".to_string(),
                "password123",
                UserRole::Editor,
            )
            .unwrap();

        let token = manager.login("test@example.com", "password123").unwrap();
        let old_access_token = token.access_token.clone();

        let new_token = manager.refresh_token(&token.refresh_token).unwrap();
        assert_ne!(old_access_token, new_token.access_token);
    }

    #[test]
    fn test_logout() {
        let manager = create_test_auth_manager();
        manager
            .register(
                "test@example.com".to_string(),
                "password123",
                UserRole::Editor,
            )
            .unwrap();

        let token = manager.login("test@example.com", "password123").unwrap();
        manager.logout(&token.access_token).unwrap();

        // Token should no longer be valid
        let result = manager.validate_token(&token.access_token);
        assert!(result.is_err());
    }

    #[test]
    fn test_password_change() {
        let manager = create_test_auth_manager();
        let user = manager
            .register(
                "test@example.com".to_string(),
                "old_password",
                UserRole::Editor,
            )
            .unwrap();

        manager
            .change_password(&user.id, "old_password", "new_password")
            .unwrap();

        // Old password should no longer work
        let result = manager.login("test@example.com", "old_password");
        assert!(result.is_err());

        // New password should work
        let result = manager.login("test@example.com", "new_password");
        assert!(result.is_ok());
    }

    #[test]
    fn test_jwt_secret_retrieval() {
        let manager = create_test_auth_manager();

        // Should be able to get the JWT secret
        let secret = manager.get_jwt_secret().unwrap();
        assert!(!secret.is_empty());
        assert!(secret.len() > 80); // Base64 encoded 64 bytes

        // Second call should return the same secret
        let secret2 = manager.get_jwt_secret().unwrap();
        assert_eq!(secret, secret2);
    }

    #[test]
    fn test_jwt_secret_rotation() {
        let manager = create_test_auth_manager();

        // Create a session
        manager
            .register(
                "test@example.com".to_string(),
                "password123",
                UserRole::Editor,
            )
            .unwrap();
        let _token = manager.login("test@example.com", "password123").unwrap();

        // Get initial secret
        let secret1 = manager.get_jwt_secret().unwrap();

        // Rotate the secret
        manager.rotate_jwt_secret().unwrap();

        // Secret should be different
        let secret2 = manager.get_jwt_secret().unwrap();
        assert_ne!(secret1, secret2);

        // All sessions should be invalidated
        let sessions = manager.sessions.read();
        assert_eq!(sessions.len(), 0);
    }
}
